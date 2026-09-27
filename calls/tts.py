"""Speaks a batch of lines with Chatterbox Multilingual (Resemble AI, MIT), for calls/build.ts.

    ~/.cache/earshot-tts/.venv/bin/python calls/tts.py jobs.json

jobs.json is a list of {"text", "lang", "out", "voice"?, "exaggeration"?, "cfg"?, "seed"?}. `voice`
is a reference clip to speak in (see VOICES.md); without one, the model's built-in voice. The
model loads once for the batch; each line is written as a WAV at the model's sample rate.
"""

import json
import sys

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = ChatterboxMultilingualTTS.from_pretrained(device=device)
builtin = model.conds

for job in json.load(open(sys.argv[1])):
    torch.manual_seed(job.get("seed", 7))
    model.conds = builtin
    wav = model.generate(
        job["text"],
        language_id=job["lang"],
        audio_prompt_path=job.get("voice"),
        exaggeration=job.get("exaggeration", 0.5),
        cfg_weight=job.get("cfg", 0.5),
    )
    ta.save(job["out"], wav, model.sr)
    print(job["out"], flush=True)
