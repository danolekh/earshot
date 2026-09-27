# Voices in the demo calls

The calls are spoken by **Chatterbox Multilingual** (Resemble AI, MIT licence), run locally by
`calls/tts.py`. Its output carries Resemble's inaudible Perth watermark, left on.

- **Agent:** Chatterbox's built-in voice (it ships with the model).
- **Caller:** Chatterbox speaking in the voice of `voices/caller-thorsten.wav`, a 10-second clip
  made with Piper's `de_DE-thorsten-high` model. That voice was donated by Thorsten Müller for open
  speech synthesis; the dataset is CC0 (github.com/thorstenMueller/Thorsten-Voice) and the Piper
  model is MIT.

No one's voice is used without a licence that allows it. The people, businesses and numbers in
the calls are invented.

Setup: `uv venv --python 3.11 ~/.cache/earshot-tts/.venv`, then
`uv pip install --python ~/.cache/earshot-tts/.venv/bin/python chatterbox-tts "setuptools<81" piper-tts`.

## Word timings

Each line's words are placed on its audio by **Qwen3-ForcedAligner-0.6B** (Alibaba Qwen, Apache
2.0), run locally by `calls/align.py`. It is a forced aligner: it's given the script and finds where
each word is, in 80 ms steps. `calls/timing.ts` then fits each word's edges to the speech under it.
whisper.cpp's word timings, used before, are heuristic; on "Ja, das ist in Ordnung." they ran about
a word late. They're still there behind `--aligner whisper`.

Results are cached in `calls/out/.align-cache/`, keyed by the model, the language, the text and the
audio's bytes, so only new or re-voiced lines are aligned again.

Setup (its own venv: `qwen-asr` pins a transformers that Chatterbox can't use):
`uv venv --python 3.12 ~/.cache/earshot-align/.venv`, then
`uv pip install --python ~/.cache/earshot-align/.venv/bin/python qwen-asr`. The first run downloads
the model (about 1–2 GB). `ALIGN_DEVICE=cpu` runs it without Metal; `ALIGN_PYTHON` points at
another interpreter.
