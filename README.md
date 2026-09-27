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

MIT © Dan Olekh
