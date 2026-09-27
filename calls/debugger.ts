/* Builds the debugger's demo calls: calls/out/<id>/{trace.json, otlp.json, session-report.json,
 * call.ogg, call.mp3}.
 *
 *   node calls/debugger.ts [id…] [--dry] [--engine chatterbox|say]   (every call when none named)
 *
 * Each chunk of each line is spoken and timed (render.ts), the lines placed on the timeline from
 * their stages (scenario.ts), the caller made to sound like a phone line and the two sides written
 * as a stereo recording (audio.ts). What LiveKit would have traced (livekit-sim.ts) is then read
 * back with earshot's `fromLiveKit`, the same path a real call takes, joined to what the recording
 * shows (peaks, speech, aligned words), and run through the detectors. It fails unless they find
 * exactly the planted problems (scenarios/<id>.expected.ts, listed in scenarios/index.ts).
 *
 * `--dry` skips the audio: a third of a second per word, for tuning the script in a second. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeMinMax, type PeakLevel } from "@danolekh/earshot/core";
import {
  callMeta,
  elevenLabsAgents,
  fromLiveKit,
  pipecat,
  readCall,
  recording,
  timedWords,
} from "@danolekh/earshot/formats";
import {
  type AudioChannel,
  type CallTrace,
  type Channel,
  type Interval,
  isNumberWord,
  mergeAnalysis,
  normalizeToken,
  speechFromPeaks,
  type TraceWord,
  type WithoutId,
} from "@danolekh/earshot/trace";
import Ajv2020 from "ajv/dist/2020.js";

import { addNoise, normalize, telephone, writeMono, writeStereo } from "./audio.ts";
import { simulateElevenLabs } from "./elevenlabs-sim.ts";
import { finish } from "./finish.ts";
import { simulateLiveKit } from "./livekit-sim.ts";
import { simulatePipecat } from "./pipecat-sim.ts";
import { checkAlignment, formatReport, type GateResult, speechOf } from "./quality.ts";
import { type Aligner, measureAll, OUT, RATE, speak, type SpeakJob } from "./render.ts";
import { chunksOf, estimateDurations, place, type Placed, type Scenario } from "./scenario.ts";
import { callId, CALLS, type DemoCall, type Stack } from "./scenarios/index.ts";

const DRY = process.argv.includes("--dry");
const flag = (name: string) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const ENGINE = (flag("--engine") ?? "chatterbox") as "chatterbox" | "say";
const ALIGNER = (flag("--aligner") ?? "qwen") as Aligner;
/** strict: bad alignment fails the build; warn: prints it; off. Whisper can't pass, so it warns. */
const GATE = (flag("--gate") ?? (ALIGNER === "whisper" ? "warn" : "strict")) as "strict" | "warn" | "off";

type RelWord = { text: string; start: number; end: number; estimated?: boolean };

/** Every chunk's audio (none when dry) and words, relative to the chunk's start. */
function render(scenario: Scenario): { samples?: Float32Array[][]; words: RelWord[][][] } {
  if (DRY) {
    const words = scenario.lines.map((l) =>
      chunksOf(l).map((c) =>
        c.text.split(/\s+/).map((text, i) => ({ text, start: i * 0.33, end: i * 0.33 + 0.3 })),
      ),
    );
    return { words };
  }
  const jobs: SpeakJob[] = [];
  for (const line of scenario.lines)
    for (const c of chunksOf(line)) {
      const voice = scenario.voices[line.channel];
      jobs.push({
        text: c.text,
        lang: scenario.lang,
        say: voice.say,
        engine: line.engine ?? ENGINE,
        ...(voice.prompt && { voice: voice.prompt }),
        exaggeration: line.exaggeration ?? voice.exaggeration ?? 0.5,
        cfg: voice.cfg ?? 0.5,
        seed: 11 + jobs.length,
      });
    }
  const files = speak(jobs, scenario.id);
  const measured = measureAll(
    jobs.map((j, i) => ({ file: files[i]!, text: j.text, lang: scenario.lang })),
    ALIGNER,
  );
  let k = 0;
  const samples: Float32Array[][] = [];
  const words: RelWord[][][] = [];
  const report: ({ line: string } & GateResult)[] = [];
  for (const line of scenario.lines) {
    const s: Float32Array[] = [];
    const w: RelWord[][] = [];
    chunksOf(line).forEach((_, c) => {
      const m = measured[k++]!;
      s.push(m.samples);
      w.push(m.words);
      if (GATE !== "off")
        report.push({
          line: `${line.id}${line.chunks ? `#${c}` : ""}`,
          ...checkAlignment(m.words, speechOf(m.samples, RATE)),
        });
    });
    samples.push(s);
    words.push(w);
  }
  // Words must sit on the speech they name, or every marker built on them is in the wrong place.
  if (GATE !== "off") {
    console.log(`  alignment (${ALIGNER}):\n${formatReport(report)}`);
    const failed = report.filter((r) => r.flags.length);
    if (failed.length && GATE === "strict") {
      console.error(
        `  ${failed.length} chunks failed the alignment gate; nothing written (--gate warn to write anyway)`,
      );
      process.exit(1);
    }
  }
  return { samples, words };
}

/** A stable pseudo-random confidence per word, high enough never to be flagged. */
function confidenceFor(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.round((0.88 + (((h >>> 0) % 1000) / 1000) * 0.11) * 100) / 100;
}

function wordsFor(scenario: Scenario, placed: readonly Placed[], rel: RelWord[][][]) {
  const aligned: Record<string, WithoutId<TraceWord>[]> = {};
  const heard: Record<string, WithoutId<TraceWord>[]> = {};
  const tts: Record<string, WithoutId<TraceWord>[]> = {};
  placed.forEach((p, li) => {
    const line = p.line;
    const all = p.chunks.flatMap((c, ci) =>
      rel[li]![ci]!.map((w) => ({ ...w, start: c.start + w.start, end: c.start + w.end })),
    );
    const at = (w: RelWord) => ({ ...w, start: round(w.start), end: round(w.end) });
    if (line.channel === "agent") {
      tts[line.id] = all.map((w) => ({
        ...at(w),
        channel: "agent" as Channel,
        source: "tts" as const,
        heard: w.start < p.end - 0.02,
      }));
      return;
    }
    const entity = (text: string) => (line.entity && isNumberWord(text) ? { entity: line.entity } : {});
    aligned[line.id] = all.map((w) => ({
      ...at(w),
      channel: "caller" as Channel,
      source: "aligned" as const,
      ...entity(w.text),
    }));
    const drop = new Set((line.asr?.drop ?? []).map(normalizeToken));
    heard[line.id] = all.flatMap((w, i) => {
      const key = normalizeToken(w.text);
      if (drop.has(key)) {
        drop.delete(key);
        return [];
      }
      const confidence = line.asr?.confidence?.[key] ?? confidenceFor(`${line.id}:${i}`);
      return [
        {
          ...at(w),
          channel: "caller" as Channel,
          source: "streaming_asr" as const,
          confidence,
          ...entity(w.text),
        },
      ];
    });
  });
  return { aligned, heard, tts };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Speech from words, for a dry run without audio: each word, pauses under 0.2 s bridged. */
function speechFromWords(words: readonly { start: number; end: number }[]): Interval[] {
  const out: Interval[] = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && w.start - last.end < 0.2) last.end = Math.max(last.end, w.end);
    else out.push({ start: w.start, end: w.end });
  }
  return out;
}

/** What each stack reports as its SDK. */
const SDK: Readonly<Record<Stack, string | undefined>> = {
  livekit: "livekit-agents 1.8.3",
  pipecat: "pipecat 1.12.0",
  elevenlabs: undefined,
};

/** Builds one call; false when its findings aren't exactly the planted ones. */
function build(entry: DemoCall): boolean {
  const { scenario, expected } = entry;
  const stack = entry.stack ?? "livekit";
  const id = callId(entry);
  console.log(`${id}${stack === "livekit" ? "" : ` (${stack})`}${DRY ? " (dry)" : ""}`);
  const { samples, words: rel } = render(scenario);
  const durations = samples
    ? Object.fromEntries(scenario.lines.map((l, i) => [l.id, samples[i]!.map((s) => s.length / RATE)]))
    : estimateDurations(scenario);
  const placed = place(scenario, durations);
  const duration = round(Math.max(...placed.map((p) => p.fullEnd)) + scenario.tail);
  const { aligned, heard, tts } = wordsFor(scenario, placed, rel);

  // The recording: each side on its own lane, the agent cut where it was interrupted. A dry run
  // writes beside the real call, never over it.
  const dir = DRY ? join(OUT, id, "dry") : join(OUT, id);
  mkdirSync(dir, { recursive: true });
  // ElevenLabs keeps one mixed file; the others, each side on its own channel.
  const mono = stack === "elevenlabs";
  let peaks: Partial<Record<AudioChannel, PeakLevel>> | undefined;
  let speech: Partial<Record<AudioChannel, Interval[]>>;
  if (samples) {
    const length = Math.ceil(duration * RATE);
    const lanes: Record<Channel, Float32Array> = {
      caller: new Float32Array(length),
      agent: new Float32Array(length),
    };
    placed.forEach((p, li) => {
      const lane = lanes[p.line.channel];
      p.chunks.forEach((c, ci) => {
        const s = samples[li]![ci]!;
        const at = Math.round(c.start * RATE);
        const stop = Math.min(s.length, Math.round((p.end - c.start) * RATE));
        const fade = Math.round(0.03 * RATE);
        for (let j = 0; j < stop && at + j < length; j++) {
          const g = p.line.stopAfter !== undefined && j > stop - fade ? (stop - j) / fade : 1;
          lane[at + j]! += s[j]! * g;
        }
      });
    });
    lanes.caller = telephone(lanes.caller);
    normalize(lanes.caller, 0.7);
    addNoise(lanes.caller, -45);
    normalize(lanes.agent, 0.7);
    if (mono) {
      const mixed = lanes.caller.map((v, i) => v + lanes.agent[i]!);
      normalize(mixed, 0.8);
      writeMono(mixed, join(dir, "call"));
      peaks = { mixed: computeMinMax(mixed, RATE, 200) };
      speech = { mixed: speechFromPeaks(peaks.mixed!) };
    } else {
      writeStereo(lanes.caller, lanes.agent, join(dir, "call"));
      peaks = {
        caller: computeMinMax(lanes.caller, RATE, 200),
        agent: computeMinMax(lanes.agent, RATE, 200),
      };
      speech = { caller: speechFromPeaks(peaks.caller!), agent: speechFromPeaks(peaks.agent!) };
    }
  } else {
    const callerWords = Object.values(aligned).flat();
    const agentWords = Object.values(tts)
      .flat()
      .filter((w) => w.heard);
    speech = mono
      ? { mixed: speechFromWords([...callerWords, ...agentWords]) }
      : { caller: speechFromWords(callerWords), agent: speechFromWords(agentWords) };
  }

  // What the stack would have recorded, read back as a real call is.
  const t0 = BigInt(Date.parse(scenario.startedAt)) * 1_000_000n;
  const spoken = Object.fromEntries(
    Object.entries(tts).map(([line, ws]) => [
      line,
      ws
        .filter((w) => w.heard)
        .map((w) => w.text)
        .join(" "),
    ]),
  );
  const heardText = Object.fromEntries(
    Object.entries(heard).map(([line, ws]) => [
      line,
      {
        text: ws.map((w) => w.text).join(" "),
        confidence: round(ws.reduce((n, w) => n + (w.confidence ?? 1), 0) / Math.max(1, ws.length)),
      },
    ]),
  );
  const base = `/calls/${id}`;
  const sources = mono
    ? [{ src: `${base}/call.mp3`, type: "audio/mpeg" }]
    : [
        { src: `${base}/call.ogg`, type: "audio/ogg; codecs=opus" },
        { src: `${base}/call.mp3`, type: "audio/mpeg" },
      ];
  const sdk = SDK[stack];
  const call = {
    id,
    title: scenario.title,
    direction: scenario.direction,
    language: scenario.language,
    duration,
    consent: "granted" as const,
    outcome: scenario.outcome,
    versions: { ...scenario.versions, ...(sdk && { sdk }) },
    synthetic: true,
  };
  const sim = { scenario, placed, t0, heard: heardText, spoken, duration };
  const startedAtUnixMs = Number(t0 / 1_000_000n);
  // What was said, timed (the reference transcript): the caller's aligned words, and the agent's.
  const reference = [...Object.values(aligned).flat(), ...Object.values(tts).flat()];
  let trace: CallTrace;
  const raw: Record<string, string> = {};
  if (stack === "livekit") {
    const { otlp, report } = simulateLiveKit(sim);
    raw["otlp.json"] = JSON.stringify(otlp);
    raw["session-report.json"] = JSON.stringify(report, null, 1);
    trace = fromLiveKit({ otlp, report, recording: { startedAtUnixMs, sources }, call });
  } else if (stack === "pipecat") {
    const { otlp, events } = simulatePipecat(sim);
    raw["otlp.json"] = JSON.stringify(otlp);
    raw["events.jsonl"] = events.map((e) => JSON.stringify(e)).join("\n");
    trace = readCall(
      pipecat({ otlp, events }),
      recording({ startedAtUnixMs, sources, channels: ["caller", "agent"], ...(peaks && { peaks }), speech }),
      timedWords(reference),
      callMeta(call),
    );
  } else {
    const conversation = simulateElevenLabs({ ...sim, ...(entry.dislike && { dislike: entry.dislike }) });
    raw["conversation.json"] = JSON.stringify(conversation, null, 1);
    trace = readCall(
      elevenLabsAgents(conversation),
      recording({ startedAtUnixMs, sources, channels: ["mixed"], ...(peaks && { peaks }), speech }),
      timedWords(reference),
      callMeta(call),
    );
  }

  // Line ids to the trace's turn ids: the turn of the same side that overlaps the line most.
  const turnOf = new Map<string, string>();
  for (const p of placed) {
    let best: { id: string; overlap: number } | undefined;
    for (const t of trace.turns) {
      if (t.channel !== p.line.channel) continue;
      const overlap = Math.min(p.end, t.end) - Math.max(p.start, t.start);
      if (overlap > (best?.overlap ?? 0)) best = { id: t.id, overlap };
    }
    if (!best) throw new Error(`${p.line.id}: no ${p.line.channel} turn overlaps it`);
    if ([...turnOf.values()].includes(best.id)) throw new Error(`${p.line.id}: turn ${best.id} is taken`);
    turnOf.set(p.line.id, best.id);
  }
  if (turnOf.size !== trace.turns.length)
    throw new Error(`${placed.length} lines, ${trace.turns.length} turns`);
  const lineOf = new Map([...turnOf].map(([line, turn]) => [turn, line]));

  if (stack === "livekit") {
    const tie = (byLine: Record<string, WithoutId<TraceWord>[]>) =>
      Object.entries(byLine).flatMap(([line, ws]) => ws.map((w) => ({ ...w, turnId: turnOf.get(line)! })));
    trace = mergeAnalysis(trace, {
      ...(peaks && { peaks }),
      speech,
      words: [...tie(aligned), ...tie(heard), ...tie(tts)],
    });
  }
  trace = finish(trace, scenario.context);

  // The trace must be what the schema says, and the findings exactly the planted ones.
  const schema = JSON.parse(
    readFileSync(fileURLToPath(import.meta.resolve("@danolekh/earshot/schema/call-trace.v1.json")), "utf8"),
  );
  const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
  if (!validate(JSON.parse(JSON.stringify(trace))))
    throw new Error(`schema: ${JSON.stringify(validate.errors, null, 2)}`);
  const found = trace.findings.map((f) => ({
    type: f.type,
    line: lineOf.get(f.turnId ?? "") ?? "?",
    severity: f.severity,
  }));
  const key = (f: { type: string; line: string; severity: string }) =>
    `${f.type} @ ${f.line} (${f.severity})`;
  const want = new Set(expected.map(key));
  const got = new Set(found.map(key));
  for (const f of trace.findings)
    console.log(
      `  ${want.has(key({ ...f, line: lineOf.get(f.turnId ?? "") ?? "?" })) ? "✓" : "✗"} ${f.start.toFixed(2)}s ${key({ ...f, line: lineOf.get(f.turnId ?? "") ?? "?" })}: ${f.message}`,
    );
  const missing = [...want].filter((k) => !got.has(k));
  const extra = [...got].filter((k) => !want.has(k));

  writeFileSync(join(dir, "trace.json"), JSON.stringify(trace, null, 1) + "\n");
  for (const [file, text] of Object.entries(raw)) writeFileSync(join(dir, file), text + "\n");
  console.log(
    `  ${duration}s, ${trace.turns.length} turns, ${trace.spans.length} spans, ${trace.findings.length} findings → ${dir}`,
  );
  if (missing.length || extra.length) {
    console.error(`  missing: ${missing.join("; ") || "none"}\n  unexpected: ${extra.join("; ") || "none"}`);
    return false;
  }
  return true;
}

// Named calls, or all of them; every one is built before the run fails.
const WITH_VALUE = new Set(["--engine", "--aligner", "--gate"]);
const named = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && !WITH_VALUE.has(all[i - 1] ?? ""));
const unknown = named.filter((id) => !CALLS.some((c) => callId(c) === id));
if (unknown.length) throw new Error(`no such call: ${unknown.join(", ")}`);
const failed = CALLS.filter((c) => !named.length || named.includes(callId(c)))
  .filter((c) => !build(c))
  .map(callId);
if (failed.length) {
  console.error(`findings differ from the planted ones: ${failed.join(", ")}`);
  process.exit(1);
}
