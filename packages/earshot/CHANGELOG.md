# Changelog

## 0.1.1

**Fixed**

- A sideways trackpad swipe at the start of the call no longer goes back a page. The scrubber takes
  every wheel with a real sideways part as a pan (a third of it is enough), including at the edge
  where the view can't move, and contains its overscroll.

## 0.1.0

First release: headless React parts for the screens around a voice agent, and the model and
readers for reviewing its calls.

**Live and playback**

- `@danolekh/earshot/core`: one conversation model (turns of timed words, tool calls, intents, latency,
  verdicts, handoffs), a live conversation you stream into, peaks and virtual clocks.
- `@danolekh/earshot/player`: a conversation and where playback is in it; the selection (turn, span,
  finding picked); `channels`, `Player.Mute` and `Player.Solo` for a stereo recording.
- `@danolekh/earshot/transcript`: follows the voice word by word, keeps words the agent never got to say,
  marks waits and silences, `Transcript.Seek` and `Transcript.Pick`; live mode with `role="log"`.
- `@danolekh/earshot/timeline`: a keyboard scrubber that steps by word, turn, marker or failed judge;
  segments, markers, overlaps, a skimmer, waveforms, zoom and pan; lanes for a call's spans,
  turn-taking signals, word tiers and findings.
- `@danolekh/earshot/orb` and `@danolekh/earshot/visualizer`: an orb of sky behind glass, drawn through
  [`@danolekh/gl`](https://www.npmjs.com/package/@danolekh/gl)'s shared WebGL2 context, and bars
  that follow a voice.
- `@danolekh/earshot/audio`: sources from a microphone, a WebRTC track, an `<audio>` element or a vendor
  SDK's volume, voice features, and a channel mix for muting a side.

**Reviewing calls**

- `@danolekh/earshot/trace`: one call on one clock (turns, pipeline spans, turn detector decisions, word
  tiers, speech found in the recording), 12 detectors, latency per reply with the time no span
  explains, heard against said, `blindSpots`, and test cases that run on other calls.
- `@danolekh/earshot/formats`: `readCall` reads a call from its sources: LiveKit Agents (OpenTelemetry and
  the session report), Pipecat (spans and observer events), ElevenLabs Agents (the conversation
  API), the recording and a reference transcription. Deepgram, AssemblyAI, OpenAI, ElevenLabs,
  Retell and WebVTT transcripts too.
- `@danolekh/earshot/review`: many calls as a list (summaries, search, counted filters, worst first) and
  links to a moment (`momentFor`, `applyMoment`, `watchMoment`).
- `@danolekh/earshot/inspector`: the parts that explain a moment: latency, heard vs said, the turn
  detector's decisions, tool calls, the model's input, and a list of findings to pick from.
- JSON schemas for a call trace and a test case (`@danolekh/earshot/schema/*.v1.json`).
