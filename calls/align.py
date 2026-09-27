"""Forced alignment for calls/render.ts: where each word of a known text starts and ends in its audio.

    ~/.cache/earshot-align/.venv/bin/python calls/align.py jobs.json out.json

jobs.json is {"model": "Qwen/Qwen3-ForcedAligner-0.6B", "jobs": [{"audio", "text", "language"}]}, where
`language` is the aligner's name for it ("German", "English"). out.json gets one entry per job, in order:
{"units": [{"text", "start", "end"}]} with seconds from the start of the file, or {"error": "..."}.

Qwen3-ForcedAligner (Apache-2.0) runs in its own venv because qwen-asr pins its own transformers; see
VOICES.md. The model loads once for the batch; a batch that fails is retried a job at a time. ALIGN_DEVICE
(mps or cpu; mps when available), ALIGN_DTYPE (float32 or bfloat16; float32) and ALIGN_BATCH (8) tune it.
Progress goes to stderr, results only to the output file (the libraries print to stdout).
"""

import json
import os
import sys

import torch
from qwen_asr import Qwen3ForcedAligner


def log(*args):
    print(*args, file=sys.stderr, flush=True)


spec = json.load(open(sys.argv[1]))
device = os.environ.get("ALIGN_DEVICE") or ("mps" if torch.backends.mps.is_available() else "cpu")
dtype = {"float32": torch.float32, "bfloat16": torch.bfloat16}[os.environ.get("ALIGN_DTYPE", "float32")]
batch = int(os.environ.get("ALIGN_BATCH", "8"))
log(f"aligner: {spec['model']} on {device} ({dtype})")
model = Qwen3ForcedAligner.from_pretrained(spec["model"], dtype=dtype, device_map=device)


def units(result):
    return [{"text": u.text, "start": float(u.start_time), "end": float(u.end_time)} for u in result]


def run(jobs):
    results = model.align(
        audio=[j["audio"] for j in jobs],
        text=[j["text"] for j in jobs],
        language=[j["language"] for j in jobs],
    )
    return [{"units": units(r)} for r in results]


out = []
jobs = spec["jobs"]
for i in range(0, len(jobs), batch):
    group = jobs[i : i + batch]
    try:
        out.extend(run(group))
    except Exception as err:  # one bad job shouldn't lose the batch
        log(f"batch {i // batch} failed ({err}); retrying one at a time")
        for job in group:
            try:
                out.extend(run([job]))
            except Exception as one:
                out.append({"error": str(one)})
    log(f"aligned {min(i + batch, len(jobs))}/{len(jobs)}")

with open(sys.argv[2], "w") as f:
    json.dump(out, f)
