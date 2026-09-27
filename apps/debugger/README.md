# Call debugger

Find the bad voice-agent call, then see why it went wrong, on one clock. Built from earshot's headless parts.

**The call list** (`/`) is a data table (tablecn's, formerly DiceUI's, on Base UI) of every call, worst first:

- search titles, what was said, and the findings;
- filter by findings, severity (has errors, warnings only, no findings), outcome, direction, prompt and stack (LiveKit, Pipecat, ElevenLabs). Each option counts the calls it would show under the other filters, and picking one never moves the toolbar;
- sort from any column's header, hide columns (remembered in the browser), and page through.

A call opens at the finding the filters point to, and each finding chip opens it at that finding. The whole state is in the URL, so a filtered list is a link; links from before the table (`?errors=1`) still work. Keys: `/` to search, j/k or ↓/↑ to move between calls, Enter to open.

**Import call** (in the list's header) takes what a stack exported, and its recording, and opens it as a call (see [Import a call](#import-a-call)).

The table's files are in `src/components/data-table/`, with a few local edits noted at the top of each. The table binds to the route's search params rather than tablecn's nuqs hook, so there's one owner of the URL, and `src/lib/triage.ts` filters and sorts for both the table and a call's previous/next.

**A call** (`/call/<id>`) is one call on one clock. The screen shows:

- both sides' audio (one lane when the recording is mono, as ElevenLabs keeps it)
- what the agent heard next to what was said
- the turn detector's decisions
- the words the agent generated, including the ones the caller never heard
- the pipeline's spans
- what the detectors found

The inspector explains whatever you pick:

- **Findings:** each marked with an icon for its kind of problem (timing, turn-taking, recognition, tools, what was said), red or amber, with the detector's own sentence. The list is one tab stop: ↑/↓, Home and End move through it, Enter picks.
- **Details:** what was said, what went wrong in plain words, then latency, tools, heard vs said, the turn detector, the model input and what it ran on. Each is folded behind a heading that already gives the gist; the one that explains the picked finding opens by itself.

Both are earshot's inspector parts (`@danolekh/earshot/inspector`) with this app's styles; the docs' `call-inspector` block is the same parts, unstyled.

**The tests** (`/tests/`) are the test cases saved from bad moments, each run on every call of the same flow: failing where it was drafted, passing once the agent's fixed (see [Test cases](#test-cases)). "Calls" and "Tests" are tabs in the header of both lists.

The stack that recorded the call is in the toolbar, with what it doesn't record: the findings no detector can look for on this call, and why (ElevenLabs keeps no end-of-turn decisions, and one mixed channel can't say who talked over whom). The inspector says "Not recorded by ElevenLabs" where a part has nothing, draws a reply's wait from the figures a stack reported (hatched, laid end to end) when it has no spans, and dashes spans that were worked out rather than traced.

The same icons and names are used in the list, the transcript and the timeline's findings lane. The URL keeps the moment and the lanes (`?t=…&from=…&to=…&finding=…&hide=…`), so a link opens on the bad moment as you saw it. "Calls" goes back to the list with its filters, and the arrows beside it step to the previous or next call in that list.

## The demo calls are synthetic

Nine calls from seven scripted German conversations, with invented companies and people. Each script is in `calls/scenarios/`, with its planted failures:

| Call                                                                              | What goes wrong                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stadtwerke-zaehlerstand`, meter reading                                          | The turn ends mid-number; "null" isn't heard, so the lookup fails and the question repeats; a 1.9 s save leaves 3.1 s of silence, part of it explained by no span                               |
| `solar-beratung`, lead call                                                       | The agent never says it's an AI; a 2.4 s calendar booking leaves 3.2 s of silence                                                                                                               |
| `praxis-termin`, moving an appointment                                            | The agent stops for a "Mhm." and has to list the slots again; later the caller cuts in and the agent reads on                                                                                   |
| `tarif-wechsel`, tariff switch                                                    | The model takes 2.75 s to its first token                                                                                                                                                       |
| `versicherung-schaden`, claim report                                              | The recogniser is unsure of the surname; the turn ends mid-sentence and the agent talks over the rest                                                                                           |
| `paket-rueckruf`, delivery                                                        | Nothing: the clean call                                                                                                                                                                         |
| `stadtwerke-zaehlerstand-v43`, the same meter reading, fixed                      | Nothing: the next agent version (prompt `zaehlerstand@8`) holds the turn through the number, hears "null", finds the customer first time and queues the save. A test saved from v42 passes here |
| `stadtwerke-zaehlerstand-pipecat`, the first call as Pipecat kept it              | The same moments, from Pipecat's spans and its observers' events; its traces carry no word confidence, so "acht" (0.41) can't be flagged                                                        |
| `stadtwerke-zaehlerstand-elevenlabs`, the first call as ElevenLabs Agents kept it | The same call from a conversation timed to the second and one mixed recording; no end-of-turn decisions and no talk-over can be seen, and a person disliked the reply that asked again          |

**The same call from three stacks.** Each stack keeps a different part of a call, so the detectors find what its data shows, and say what they can't look at:

| Planted in the first call | LiveKit | Pipecat (spans + observer events, stereo) | ElevenLabs (conversation, mono)           |
| ------------------------- | ------- | ----------------------------------------- | ----------------------------------------- |
| Turn ended mid-number     | ✓       | ✓ (`user_turn_stopped`)                   | can't check: no end-of-turn decisions     |
| Talk-over ×2              | ✓       | ✓                                         | can't check: mono                         |
| "null" not heard          | ✓       | ✓                                         | ✓                                         |
| "acht" unsure (0.41)      | ✓       | can't check: no word confidence           | can't check                               |
| Tool failed               | ✓       | ✓ (failed event)                          | ✓ (`is_error`)                            |
| Question repeated         | ✓       | ✓                                         | ✓                                         |
| Dead air                  | ✓       | ✓                                         | ✓ (in the mixed recording)                |
| Slow reply, slow save     | ✓       | ✓                                         | ✓ (`tool_latency_secs`, reported figures) |

Every stack's call gets the same reference transcript (what was said, as forced alignment timed it): the stand-in for a second transcription of the recording, which moves the turns to where they were spoken.

How each call is built:

1. Each line is spoken with Chatterbox (or macOS `say`). Its words are placed on the audio by forced alignment with Qwen3-ForcedAligner-0.6B, and their edges are fitted to the speech under them. Anything Chatterbox says after the last word is cut.
   A gate then checks that every word sits on speech, with no pause under a word and nothing out of order. If any line fails, the build stops before writing, and it prints the table. `--gate warn` prints the table and carries on.
2. The lines are placed on the timeline from their pipeline stages.
3. The caller is band-limited to a phone line, and both sides are written as a stereo recording (caller left, agent right), or one mono MP3 for ElevenLabs.
4. What the stack would have recorded is generated: LiveKit's spans (OTLP/JSON with its span names and `lk.*` attributes) and session report (`livekit-sim.ts`); Pipecat's spans and observer events (`pipecat-sim.ts`); ElevenLabs' conversation (`elevenlabs-sim.ts`).
5. That is read back with earshot's `readCall` and the stack's source (`fromLiveKit`, `pipecat`, `elevenLabsAgents`), the same path a real call takes.

`calls/golden.test.ts` replays every call from its saved export (`calls/fixtures/<id>/`) and must get the built trace back, value for value, so a change to how calls are read can't move anything unnoticed.

The build fails unless the detectors find exactly each call's planted problems (`calls/scenarios/<id>.expected.ts`, listed in `calls/scenarios/index.ts`).

```sh
pnpm --filter @danolekh/earshot build
node calls/debugger.ts --dry          # every call, in seconds: a third of a second per word, no audio
node calls/debugger.ts [id…]          # Chatterbox voices (cached); --engine say for macOS voices, --aligner whisper for the old timings
pnpm --filter debugger call           # copies the recordings and traces into this app, with the list's summaries
pnpm --filter debugger dev            # http://localhost:3011
```

The copies in `public/calls/` and `src/calls/` (including `index.json`, the list's summaries) are committed, so building the app needs no voices or aligner.

## Keys

| Key            | Action                                        |
| -------------- | --------------------------------------------- |
| Space or K     | Play or pause                                 |
| J / L          | Back or forward 10 s                          |
| `]` / `[`      | Next or previous finding (Shift: errors only) |
| W / S          | Zoom in or out                                |
| A / D          | Pan                                           |
| 0              | Show the whole call                           |
| Z              | Zoom to what's picked                         |
| Ctrl/⌘ + wheel | Zoom at the pointer                           |
| F              | Follow playback on or off                     |
| V              | Open the View menu                            |
| T              | Fold the transcript away or back              |
| 1 / 2 / 3 / 4  | Caller, agent, pipeline or word lanes on/off  |
| B              | Show or hide the inspector                    |
| Ctrl/⌘ + B     | Show or hide the inspector (always on)        |
| `?`            | Show every key                                |

Single-key shortcuts can be turned off in the `?` sheet (WCAG 2.1.4).

## View and listening

The screen is split into resizable panels (motion-panels):

- **Timeline:** about two thirds of the height by default. Its lanes grow to fill it; waveforms take most of the room, and each other lane grows only as far as its content can use.
- **Transcript:** below the timeline. `T` folds it away.
- **Inspector:** on the right. `B` or ⌘B folds it away.

Drag a separator to resize, or focus it to use the arrow keys, Home/End, or Enter to fold. The sizes are remembered in the browser, and the page opens at them with no jump: the head script sets them before the first paint.

The View menu on the right of the toolbar picks what the timeline shows:

- **Sets:** the caller's lanes, the agent's, the pipeline's, or every word lane, together (keys 1 to 4). A partly shown set reads as mixed, and one click shows all of it.
- **Each lane:** each lane on its own, in a submenu. A lane can also be hidden from the eye next to its label in the gutter.
- **Layout:** "Caller only" and "Agent only", or every lane again.
- **Panels:** the transcript and the inspector.
- **Density:** compact, comfortable or expanded.
- **Theme:** system, light or dark.
- **Reset view:** default lanes, density and panel sizes.

A few rules apply:

- The last lane shown can't be hidden.
- The View button counts the hidden lanes.
- Jumping to a finding works whatever is shown. When what you picked is on a hidden lane, a notice offers to show it.
- The lanes and density are remembered in the browser, and hidden lanes also go in the URL. The theme applies before the first paint, and a closed inspector stays closed on reload.

M and S next to each audio lane mute or solo that side of the call, as in a mixer. They're separate from hiding a lane:

- A soloed side plays in both ears.
- A side you can't hear is dimmed.
- They aren't remembered, since a side silent on your next visit would look like broken audio.

The recording goes through Web Audio (earshot's `mixChannels`) only from the first time you use them.

A lane hidden from its gutter eye leaves a thin strip where it was ("Show Caller audio", as spreadsheets do for hidden columns), and an Undo toast for a few seconds. Neighbouring hidden lanes share one strip.

These patterns come from Chrome DevTools' track configuration, Perfetto, Logic and REAPER's track hiding, and Premiere and Resolve's track headers. The voice-agent call views we looked at (LiveKit, Vapi, Retell, Roark, Coval) split a call into tabs rather than hiding lanes.

## Test cases

"Save as test case", in a turn's details or on a finding's row (on hover), drafts a test from that moment:

- **Covers:** the exchange it happened in (the caller's turn and the agent's reply).
- **Context:** what the agent ran on (prompt, model, how much context).
- **Checks:** one per finding there, stating what the agent should have done instead.

  | Check                | Written as                                       |
  | -------------------- | ------------------------------------------------ |
  | A reply in time      | "Replies within 1.5 s"                           |
  | The words heard      | "Hears 'vier sieben eins null acht drei'"        |
  | A tool that succeeds | "crm.lookup_customer succeeds"                   |
  | No finding of a kind | "Waits for the caller to finish before replying" |

Each check runs on this call as you edit it, and a good test fails here: that's the bug caught.

**On other calls.** A check about a turn keeps what the caller said there (its anchor). On any other call it runs on the caller turn with at least 70% of those words in order, or on the agent's reply to it. Timing, turn-taking and recognition findings are checked on that turn; dead air and a missing AI disclosure are checked across the whole call. A check whose turn isn't in a call is "not found", which isn't a failure. The checks are earshot's (`runTestCase` in `@danolekh/earshot/trace`), so anything that has a trace can run them.

**Save** keeps the test in this browser, on the Tests page. There, each test runs on every call with the same title, oldest first: for the demo, "v42 · 4 of 4 fail" and "v43 · All pass". Each result opens to its checks, what was measured, and a link to the moment it looked at. Deleting a test has an Undo.

**Export** (in the dialog and on each test):

- **Download .json:** the test case as a file, schema `@danolekh/earshot/schema/call-test.v1.json`.
- **Copy as JSON.**
- **Copy as LiveKit test (pytest):** a [LiveKit Agents unit test](https://docs.livekit.io/testing/unit-tests/) in text mode. It seeds the history the model had, sends what the caller said (not what was heard), and expects the tool call with the arguments that worked later in the call (`crm.lookup_customer` with `customer_id: "471083"`) and no repeated question (an LLM judge). Checks that need audio (timing, turn-taking, recognition) are listed in a comment: those run on a recorded or simulated call, below.

**In CI**, run the file on each new version's calls: traces, or what the stack exported (a call's files joined with `+`):

```sh
node apps/debugger/scripts/check.ts tool-error.test.json v42.trace.json v43.trace.json
node apps/debugger/scripts/check.ts tool-error.test.json otlp.json+events.jsonl     # a Pipecat call as exported
```

```
stadtwerke-zaehlerstand (stadtwerke-outbound v42), drafted here: 4 of 4 fail
  ✗ crm.lookup_customer succeeds              404: no contract for customer_id 47183 (agent at 0:26)
  ✗ Hears “Vier sieben eins null acht drei.”  “null” not heard (caller at 0:22)
  …
stadtwerke-zaehlerstand-v43 (stadtwerke-outbound v43): All pass
  ✓ crm.lookup_customer succeeds              succeeded (1×) (agent at 0:19)
  …
```

It exits 1 when any check fails, and 2 when a file isn't a test case or a call. A check on data a stack didn't record (word confidence from Pipecat, end-of-turn decisions from ElevenLabs) shows —, "can't check", never a pass.

A check finds its moment on another call by what the caller said there, and which time they said it (a number read back later doesn't count as the first reading), so it lands on the same moment even where the words were heard differently.

## Import a call

**Import call** on the list takes the files a stack exported, dropped in any order (each is recognised by its shape), and the recording:

| Stack             | Files                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LiveKit Agents    | The session's spans as OTLP/JSON; the session report (`make_session_report`), if kept                                                                              |
| Pipecat           | The spans as OTLP/JSON (`PipelineWorker(enable_tracing=True)`, exported through a collector's file exporter); the observers' events as JSON lines, if kept (below) |
| ElevenLabs Agents | The conversation (`GET /v1/convai/conversations/{id}`, or the `post_call_transcription` webhook) and its audio (`…/audio`)                                         |
| earshot           | A call trace (`call-trace.v1`)                                                                                                                                     |

The recording is decoded in the browser, and its waveform and speech worked out; stereo is caller left and agent right (a switch for a file that isn't), mono is both sides mixed. Before opening, the dialog says what was read (stack, turns, spans, findings), what can't be checked on it, and what had to be assumed. The call is kept in this browser (IndexedDB, with the recording), joins the list marked "Imported" (remove it there, with Undo), opens at `/imported/?id=…`, and is one of the calls saved tests run on.

For Pipecat, keeping the observers' events gives measured speech edges, the turn detector's decisions and timed tool calls; the recording's start puts it on the spans' clock:

```python
import json, time
from pipecat.observers.function_call_observer import FunctionCallObserver
from pipecat.observers.speaking_observer import SpeakingObserver
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor

log = open("events.jsonl", "a")
speaking, calls = SpeakingObserver(), FunctionCallObserver(include_results=True)
recorder = AudioBufferProcessor(num_channels=2)  # caller left, bot right

@speaking.event_handler("on_speech_event")
async def on_speech_event(observer, event):
    log.write(event.model_dump_json() + "\n")

@calls.event_handler("on_function_call_event")
async def on_function_call_event(observer, event):
    log.write(event.model_dump_json() + "\n")

@recorder.event_handler("on_recording_started")
async def on_recording_started(processor):
    log.write(json.dumps({"kind": "recording_started", "timestamp": time.time()}) + "\n")

worker = PipelineWorker(pipeline, enable_tracing=True, observers=[speaking, calls])
```

## Checks

```sh
pnpm --filter debugger test                                  # unit tests (vitest), and the CI runner
pnpm --filter debugger build && pnpm --filter debugger e2e   # Playwright, against vite preview
pnpm --filter debugger shots [dir]                           # screenshots, dark and light
```

The e2e suite and the screenshots fail on any console error, hydration warnings included.

## Deploy

`pnpm --filter debugger build && pnpm --filter debugger deploy` serves `.output/public` as Cloudflare static assets on `debugger.danolekh.com` (see `wrangler.jsonc`).
