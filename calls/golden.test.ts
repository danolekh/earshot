/* The built calls, replayed from what each stack recorded: LiveKit's spans and session report,
 * Pipecat's spans and observer events, ElevenLabs' conversation, read back the way a real call is,
 * with the recording's analysis (peaks, speech, the reference words) taken from the built trace,
 * then `finish`. The result must equal the trace that was built, value for value, so a change to
 * how traces are read can't move anything unnoticed. `read.json` is LiveKit's own read, before the
 * analysis replaces its estimated words. Fixtures in fixtures/<id>/ (copied from out/ after a real
 * build). */
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { decodePeakLevel, type EncodedPeakLevel } from "@danolekh/earshot/core";
import {
  callMeta,
  type ElevenLabsConversation,
  elevenLabsAgents,
  fromLiveKit,
  type LiveKitSessionReport,
  type OtlpTraces,
  type PipecatEvent,
  pipecat,
  readCall,
  recording,
  timedWords,
} from "@danolekh/earshot/formats";
import { type AudioChannel, type CallTrace, mergeAnalysis } from "@danolekh/earshot/trace";
import { describe, expect, it } from "vitest";

import { finish } from "./finish.ts";
import { callId, CALLS } from "./scenarios/index.ts";

const dir = new URL("fixtures/", import.meta.url);
const ids = readdirSync(dir);
const text = (id: string, file: string) => readFileSync(new URL(`${id}/${file}`, dir), "utf8");
const json = (id: string, file: string) => JSON.parse(text(id, file));
const has = (id: string, file: string) => existsSync(new URL(`${id}/${file}`, dir));

/** JSON with every object's keys sorted, so only values can differ. */
const canonical = (value: unknown): string =>
  JSON.stringify(
    value,
    (_, v: unknown) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : v,
    1,
  );

const peaksOf = (golden: CallTrace) =>
  Object.fromEntries(
    Object.entries(golden.audio?.peaks ?? {}).map(([ch, p]) => [ch, decodePeakLevel(p as EncodedPeakLevel)]),
  ) as Partial<Record<AudioChannel, ReturnType<typeof decodePeakLevel>>>;

const livekitIds = ids.filter((id) => has(id, "session-report.json"));
const otherIds = ids.filter((id) => !has(id, "session-report.json"));
const goldenOf = (id: string) => json(id, "trace.json") as CallTrace;
const entryOf = (id: string) => CALLS.find((c) => callId(c) === id)!;
const callOf = (golden: CallTrace) => {
  const { startedAt: _, provider: _p, ...call } = golden.call;
  return call;
};

describe.each(livekitIds)("%s, replayed from LiveKit", (id) => {
  const golden = goldenOf(id);
  const otlp = json(id, "otlp.json") as OtlpTraces;
  const report = json(id, "session-report.json") as LiveKitSessionReport;
  const read = () =>
    fromLiveKit({
      otlp,
      report,
      recording: { startedAtUnixMs: golden.clock.t0UnixMs, sources: golden.audio!.sources },
      call: callOf(golden),
    });

  it("reads the same trace from LiveKit's spans", async () => {
    await expect(`${canonical(read())}\n`).toMatchFileSnapshot(`fixtures/${id}/read.json`);
  });

  it("builds the same call", () => {
    const merged = mergeAnalysis(read(), {
      peaks: peaksOf(golden),
      ...(golden.speech && { speech: golden.speech }),
      words: golden.words.map(({ id: _id, ...w }) => w),
    });
    expect(JSON.parse(JSON.stringify(finish(merged, entryOf(id).scenario.context)))).toEqual(golden);
  });
});

// Pipecat or ElevenLabs: the stack's own export, the recording, and what was said.
describe.each(otherIds)("%s, replayed from its stack's export", (id) => {
  it("builds the same call", () => {
    const golden = goldenOf(id);
    const provider = has(id, "conversation.json")
      ? elevenLabsAgents(json(id, "conversation.json") as ElevenLabsConversation)
      : pipecat({
          otlp: json(id, "otlp.json") as OtlpTraces,
          events: text(id, "events.jsonl")
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l) as PipecatEvent),
        });
    // What the pipeline gave as said: the caller's aligned words and the agent's (the recogniser's
    // are the stack's, worked out from its transcript).
    const reference = golden.words
      .filter((w) => w.source !== "streaming_asr")
      .map(({ id: _id, turnId: _t, ...w }) => w);
    const trace = readCall(
      provider,
      recording({
        startedAtUnixMs: golden.clock.t0UnixMs,
        sources: golden.audio!.sources,
        channels: golden.clock.channels,
        peaks: peaksOf(golden),
        ...(golden.speech && { speech: golden.speech }),
      }),
      timedWords(reference),
      callMeta(callOf(golden)),
    );
    expect(JSON.parse(JSON.stringify(finish(trace, entryOf(id).scenario.context)))).toEqual(golden);
  });
});
