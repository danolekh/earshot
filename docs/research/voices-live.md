# Voices and a live demo (2026-09-25)

## Demo audio

| Option                                         | Notes                                                     | Cost                          | Licence                                      |
| ---------------------------------------------- | --------------------------------------------------------- | ----------------------------- | -------------------------------------------- |
| ElevenLabs v3 Text-to-Dialogue with timestamps | best; multi-speaker; character alignment                  | ~$0.50 within Starter ($6/mo) | free tier non-commercial; Starter commercial |
| OpenAI gpt-4o-mini-tts                         | steerable, 11 voices, no alignment                        | < $0.05                       | disclose AI voice                            |
| Cartesia Sonic                                 | natural; word timestamps over WS                          | free non-commercial; Pro $5   | Pro commercial                               |
| Gemini TTS                                     | two speakers, style prompts                               | free in AI Studio             | free tier data may be used                   |
| **Chatterbox Multilingual** (local)            | 23+ languages incl. German, emotion exaggeration, cloning | free                          | **MIT**, inaudible watermark                 |
| Kokoro-82M                                     | great English, no official German                         | free                          | Apache-2.0                                   |
| Piper thorsten                                 | clean, synthetic                                          | free                          | MIT                                          |
| F5-TTS / XTTS-v2                               |                                                           |                               | non-commercial: avoid                        |

Chosen: Chatterbox (Dan, 2026-09-25). ElevenLabs Starter stays the upgrade.

## Live "talk to it"

- OpenAI gpt-realtime-mini over WebRTC: a Worker mints ephemeral keys behind Turnstile and a rate limit; ~$0.03-0.05 a session.
- Gemini Live: cheaper or free, unpublished limits, training terms.
- ElevenLabs Agents: no backend, best orb API (input/output volume and frequency getters), ~$0.08/min, 15 free minutes a month.
- Security: Turnstile, per-IP rate limit, origin check, token TTL ≤ 60 s, server-locked instructions, 90-120 s sessions, a budget-capped project, no tools.
- Chosen for now: a mic playground (mic → orb and visualizer, Web Speech API transcript; Chrome/Edge yes, Safari as webkitSpeechRecognition, Firefox off by default). AI later.
