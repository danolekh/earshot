# earshot

Headless React parts for voice-agent UIs: an orb that shows what the agent is doing, visualizers,
a transcript that follows the voice word by word, and a call-review timeline with tool calls,
latency and judges. No styles shipped: state is data attributes, motion is CSS variables.

**Docs and live demos: [earshot.danolekh.com](https://earshot.danolekh.com)**

```bash
pnpm add @danolekh/earshot @base-ui/react
```

```tsx
import { Orb } from "@danolekh/earshot/orb";
import { Player } from "@danolekh/earshot/player";
import { Timeline } from "@danolekh/earshot/timeline";
import { Transcript } from "@danolekh/earshot/transcript";

<Orb.Root state="speaking" output={agentVoice} className="size-40">
  <Orb.Shader />
</Orb.Root>

<Player.Root conversation={call} src="/call.mp3">
  <Timeline.Root>
    <Timeline.Scrubber>
      <Timeline.Lane speaker="agent"><Timeline.Segments /><Timeline.Waveform speaker="agent" /></Timeline.Lane>
      <Timeline.Lane speaker="user"><Timeline.Segments /><Timeline.Waveform speaker="user" /></Timeline.Lane>
      <Timeline.Markers />
      <Timeline.Playhead />
    </Timeline.Scrubber>
  </Timeline.Root>
  <Transcript.Root>
    <Transcript.Turns />
  </Transcript.Root>
</Player.Root>
```

- **One conversation model:** timed turns and events (tool calls, intents, latency, verdicts).
  Deepgram, AssemblyAI, OpenAI, ElevenLabs, Retell and WebVTT come in through `@danolekh/earshot/formats`.
- **The orb:** a sphere of sky behind glass on a shared WebGL2 context, no three.js. A perfect
  circle that swells, brightens and churns with the voice; each state reads at a glance.
- **Review:** a keyboard scrubber that steps by word, turn, marker or failed judge; interruptions
  kept as data; overlaps, waits and a skimmer.
- **Live:** a streaming transcript with interim text, and audio sources for a microphone, a WebRTC
  track, an `<audio>` element or a vendor SDK's volume.
- **The inspector:** `@danolekh/earshot/inspector` has the parts that explain a moment: where a reply's
  wait went, what was heard against what was said, the turn detector's decisions, tool calls,
  the model's input, and a keyboard list of findings to pick from. The `call-inspector` block in
  the registry puts them together on a trace.
- **Calls from any stack:** `@danolekh/earshot/trace` is one call on one clock (turns, pipeline spans, turn
  detector decisions, word tiers, findings from 12 detectors, test cases), and `@danolekh/earshot/formats`
  reads it from LiveKit Agents, Pipecat or ElevenLabs Agents as layers (below). `@danolekh/earshot/review`
  sums calls up for a list: search, counted filters, worst first, links to a moment.

### A call from its layers

Each source supplies what it knows of a call; `readCall` puts them on one clock (the surest start:
the recording's, then a report's, a session's, the first span's), merges them, and works out the
rest: which caller turn each reply answers, interruptions, words spread over untimed turns, and
turn edges a source had to guess, moved onto timed words or the recording's speech. A provider is
only a source, so a new stack is one more.

```ts
import { pipecat, readCall, recording, timedWords } from "@danolekh/earshot/formats";
import { detect } from "@danolekh/earshot/trace";

const trace = detect(
  readCall(
    pipecat({ otlp, events }), // spans, and the observers' events (JSON lines)
    recording({ startedAtUnixMs, sources, channels: ["caller", "agent"], peaks }),
    timedWords(reference), // optional: a second transcription, what was really said
  ),
);
```

| Source                                                    | Reads                                                                                                                        | Can't see                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `livekit({ otlp, report })`                               | OpenTelemetry spans (`agent_session`, `user_turn`, `agent_turn`…) and the session report                                     | Word timings (estimated)                                                              |
| `pipecat({ otlp, events })`                               | `conversation` > `turn` > `stt`/`llm`/`tts` spans; `SpeakingObserver` and `FunctionCallObserver` events                      | Word confidence; without events, when anyone spoke and how tools went (worked out)    |
| `elevenLabsAgents(conversation)`                          | The conversation API's JSON (or its webhook): messages to the second, tool calls with latency, per-message figures, feedback | Turn-detector decisions, word confidence; on its mono recording, who talked over whom |
| `recording({...})`, `timedWords(words)`, `callMeta(meta)` | The recording's start, files and waveform (speech is found in it); what was said, timed; details known elsewhere             |                                                                                       |

What a stack didn't record is named, not guessed: `blindSpots(trace)` says which detectors can't
look at this call and why, and a test-case check on one of them comes back "missing", never as a
pass. `readExports(files)` recognises the files of any of these stacks (`detectFormat`) and reads
them into one call.

MIT © Dan Olekh
