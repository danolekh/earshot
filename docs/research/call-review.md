# Call review, transcripts, timelines: inspirations and spec

Research pass, 2026-09-25. (docs) = from the linked page; (obs.) = recalled, verify on a live screen.

## Inspirations worth stealing

**Call and meeting review**

- Gong (help.gong.io/docs/intro-to-the-call-page): one lane per speaker, sorted by speech volume, silent ones hidden; hover a lane name for solo/mute; talk-share % at the right end; topic outline drawn on the timeline with hover-to-see-what-was-said; both lanes and the bar scrub. (docs)
- Avoma: the timeline colour-filled by topic, the legend doubling as filter and jump target; "play only this speaker"; ±10 s skip, 0.75-2x. (docs)
- Chorus: moment markers, clip a range and attach a coaching comment. (docs)
- Fathom: active line highlight and auto-scroll; line, highlight or marker click seeks.
- Fireflies: soundbites from selected text; "clip the last 20/40/60 s" during a live call.
- Otter: word highlight during playback, tap a word to seek; Highlight marks the current span.
- Granola: authorship by contrast (yours black, AI grey), the same idiom for _generated vs spoken_.
- Zoom Smart Recording: chapters segment the scrubber, each with a summary.
- Loom: transcript beside the video, search, copy, click any word to seek.

**Editors and players**

- Descript: the text caret is independent of the playhead; arrows step, holding scrubs; a "wordbar" of one box per word aligned over the waveform. (docs)
- Riverside: the speaker's colour carries from transcript label to their timeline waveform.
- Apple Podcasts: word-by-word highlight, tap a paragraph to play from it, New York serif tuned for contrast, speaker changes as paragraph breaks, **three slowly filling dots for ad breaks**. (docs)
- Apple Music lyrics: active line springs up, past lines dim and blur; each word **fills left to right by its own time window**, so the pace of the fill is the pace of the voice; interludes as three breathing dots.
- Spotify lyrics: spring scale, lift and glow per word; distance blur, cached offscreen; manual scroll pauses follow.
- YouTube transcript: grey background on the current segment, auto-scroll, toggle timestamps.
- Snipd: one gesture saves the moment with audio, transcript and summary.

**Waveforms and scrubbers**

- SoundCloud: mirrored bars, played orange and unplayed grey; timed comments as pips on the baseline that expand on hover (read them as density, not identity).
- Telegram/WhatsApp voice notes: 50-60 rounded bars, whole bars recolour as progress passes; pointer capture for drag; tap cycles 1x/1.5x/2x.
- Screen Studio: segments as blocks on their own lane, keyframes as diamonds, Cmd+scroll zoom.
- IMG.LY timeline: handle hit areas over 2x their width; snap only to points in view, with guides; ruler labels adapt; floor timecodes.
- Rauno Freiberg: scrubbing shows live content, never seek-on-release; keyboard and high-frequency actions don't animate (a brief accent blink instead); motion is interruptible.
- Emil Kowalski: ease-out entrances, under 300 ms, near zero for repeated actions; transform and opacity only.
- Final Cut/CapCut: a hover skimmer separate from the playhead; J/K/L shuttle.

**Agent traces and evals**

- Langfuse timeline (users' asks): a crosshair with the time under the cursor; the duration of a dragged interval; **t=0 at the end of the user's speech (VAD end)** with earlier events negative.
- Braintrust: span tree + details, judge reasoning on scorer spans, diff mode between runs.
- LangSmith voice: audio over the trace, STT/TTS latency, VAD events, **highlighted interruptions and overlapping speech**; record stereo, user and agent on separate channels.
- LiveKit Agent Insights: one timeline of audio, transcript, spans, tool calls, handoffs; traces stream live, audio and transcript arrive after.
- Retell/Vapi: e2e latency from user stop to agent start, P50/P90/P99, per-stage breakdown (ASR, LLM, TTS); tool results inline.
- Coval/Hamming/Cekura: audio metrics next to LLM-judge metrics; **a clean transcript can hide a 4 s pause or talk-over: the eval UI must show time, not just text.**
- Bland: the active pathway node, an argument for an intent/node marker lane.

## Spec: Transcript

- One turn one block; speaker label in the speaker's colour above the first line; speaker changes are paragraph breaks.
- Past at ~55% opacity, current turn full, future ~35%. Blur optional and off by default (lyrics feel, bad for review).
- Active word: a left-to-right fill from `--word-progress` (background-clip text gradient, or a mask), a faint pill behind it at ~12% of the speaker colour. No scale (it reflows). Words under 80 ms snap on.
- Interruptions: the unspoken tail in the same colour at ~30% with a dotted underline, ending in a dash, and a chip linking to the barging turn. Overlap: the barging turn indented with a 2 px rule in the user colour and an "overlap 620 ms" chip. Backchannels ("mm-hm") as small inline pills.
- Event chips at their moment: tool `⚙ get_order · 340 ms`, intent `◆ refund_request`, verdict `✓/✗ policy` with the reasoning on hover, latency as a hairline row between turns (`— 1.8 s —`, red past the budget, 800 ms by default).
- Gaps over 2 s: three breathing dots.
- Follow keeps the active line at ~35% height; manual scroll pauses it and shows "Jump to now"; `F` resumes.
- Selection independent of the playhead; a range toolbar (play range, copy, clip, comment).
- Live: partial words italic at 40%, settling to roman when final; replaced words cross-fade 120 ms without layout jump.

## Spec: Timeline

- Lanes: ruler, markers, agent (waveform + turn blocks), user, a thin latency lane, an optional 4 px topic/sentiment band. Left gutter: name, colour dot, solo on hover. Right gutter: talk share.
- Waveform: rounded 2/1 px bars (3/2 zoomed out), mirrored, precomputed; played bars the speaker colour at 100%, unplayed 35%; whole bars recolour. Turn blocks as 10% tints behind the bars.
- Overlap: 45° hatching across both lanes and a red tick at the barge-in.
- Markers differ by shape, not only colour: tool = square (as wide as its duration past 4 px), intent = diamond, verdict = circle (filled green pass, red ring fail), interruption = notched tick, comment = pip, error = triangle; markers closer than 6 px merge into a count.
- Latency: a bracket per handoff from the user's last word to the agent's first sound, stacked stages inside (endpointing, STT, LLM TTFT, tool, TTS); green under budget, amber under 1.5x, red above; click opens a waterfall anchored at t=0 = VAD end.
- Playhead: 1.5 px accent line, 6 px cap, a floored tabular-nums time flag.
- Hover skimmer: hairline + time readout + tooltip with what was said, who, and any marker. Never seeks.
- Shift-drag measures an interval; plain drag scrubs live.
- Zoom: Cmd+scroll/pinch anchored at the cursor, `+`/`-`; snap to visible marks only.
- Keys: Space play; J/K/L shuttle; ←/→ a word; Shift+←/→ 5 s; Alt+←/→ a turn; `[`/`]` a marker; Shift+`[`/`]` a failed judge; `,`/`.` speed; I/O range; M mark; F follow; Home/End. One `role="slider"` with `aria-valuetext` like "1:23, Agent speaking".

## Layouts

- **Call review:** header (caller, outcome, duration, P50/P90 handoff latency, interruptions, tool errors); transcript left ~60%, tabs right (Moments, Details, Comments); a sticky timeline ~160 px, collapsible to a 32 px mini bar. Selecting in any of transcript, timeline and moments highlights the other two.
- **Simulation run review:** a scenario rail (pass/fail dot, score sparkline, duration, a 40 px mini-timeline with red ticks for failures), sorted by failed judges; the selected call as call review, with a judge strip above the timeline (click a judge to jump to its evidence, Shift+`]` walks failures); compare mode aligns two runs by turn index, with latency deltas per handoff.

## Ten micro-interactions

1. Word fill driven by the word's own duration.
2. Follow that yields to the reader, with "Jump to now".
3. A hover skimmer apart from the playhead.
4. The unspoken tail ghosted after a barge-in, linked to the interrupting turn.
5. Latency brackets opening a t=0-anchored waterfall.
6. Shift-drag to measure.
7. Solo a speaker from the lane gutter.
8. Marker hopping with `[`/`]`, next failure with Shift+`]`; no animation on keyboard seeks, a one-time accent blink on the line.
9. Breathing dots for silence, hold, thinking.
10. Mark now (M) / clip the last 15 s (Shift+M).

Motion throughout: ease-out 150-250 ms, transform and opacity only, no animation on keyboard seeks, reduced motion turns fills into instant highlights.
