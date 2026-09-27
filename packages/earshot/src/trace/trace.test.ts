import { describe, expect, it } from "vitest";

import { computeMinMax, encodePeakLevel } from "../core/pyramid";
import { speechFromPeaks } from "./analysis";
import { diffWords } from "./diff";
import { coverage } from "./latency";
import { createTrace, toConversation, wordsOf } from "./trace";
import type { TraceWord } from "./types";

const clock = { t0UnixMs: 0, channels: ["caller", "agent"] as const };

describe("createTrace", () => {
  const trace = createTrace({
    call: { id: "c" },
    clock,
    turns: [
      { channel: "agent", start: 2, end: 3, interrupted: { at: 2.6 } },
      { channel: "caller", start: 0, end: 1.5 },
    ],
    words: [
      { channel: "agent", source: "tts", text: "Guten", start: 2, end: 2.4, heard: true },
      { channel: "agent", source: "tts", text: "Tag.", start: 2.7, end: 3, heard: false },
      { channel: "caller", source: "streaming_asr", text: "hallo", start: 0.1, end: 0.5, confidence: 0.5 },
      { channel: "caller", source: "aligned", text: "Hallo", start: 0.1, end: 0.5 },
      { channel: "caller", source: "aligned", text: "da", start: 0.6, end: 1.4 },
    ],
  });

  it("sorts turns, gives ids, ties words to turns and builds text from them", () => {
    expect(trace.turns.map((t) => [t.id, t.channel, t.text])).toEqual([
      ["t0", "caller", "Hallo da"],
      ["t1", "agent", "Guten Tag."],
    ]);
    expect(wordsOf(trace, { turnId: "t0", source: "streaming_asr" }).map((w) => w.text)).toEqual(["hallo"]);
    expect(trace.call.duration).toBe(3);
  });

  it("projects what was said for the caller and what was generated for the agent", () => {
    const c = toConversation(trace);
    expect(c.turns[0]!.words.map((w) => w.text)).toEqual(["Hallo", "da"]);
    expect(c.turns[1]!.interruptedAt).toBe(2.6);
    expect(c.turns[1]!.words.map((w) => w.text)).toEqual(["Guten", "Tag."]);
  });

  it("turns stored peaks into the older overview, per role", () => {
    const samples = new Float32Array(8000).fill(0.5);
    const withPeaks = createTrace({
      call: { id: "p" },
      clock,
      audio: { sources: [], peaks: { caller: encodePeakLevel(computeMinMax(samples, 8000)) } },
      turns: [],
    });
    const peaks = toConversation(withPeaks).peaks as Record<string, { rate: number }>;
    expect(Object.keys(peaks)).toEqual(["user"]);
    expect(peaks.user!.rate).toBe(50);
  });
});

describe("diffWords", () => {
  const w = (text: string, i: number): TraceWord => ({
    id: `${text}${i}`,
    channel: "caller",
    source: "aligned",
    text,
    start: i,
    end: i + 0.5,
  });
  const words = (text: string) => text.split(" ").map(w);

  it("finds a dropped word", () => {
    const d = diffWords(words("vier sieben eins acht drei"), words("vier sieben eins null acht drei"));
    expect(d.filter((x) => x.op !== "same").map((x) => [x.op, x.said?.text])).toEqual([["missing", "null"]]);
  });

  it("pairs a dropped and an inserted word as a change, ignoring case and punctuation", () => {
    const d = diffWords(words("Ich habe Mayer."), words("ich habe Meier"));
    expect(d.map((x) => x.op)).toEqual(["same", "same", "changed"]);
    expect(d[2]).toMatchObject({ heard: { text: "Mayer." }, said: { text: "Meier" } });
  });
});

describe("speechFromPeaks", () => {
  it("finds speech above the noise floor, bridging short pauses and ending where the sound stops", () => {
    const rate = 8000;
    const s = new Float32Array(rate * 3);
    for (let i = 0; i < s.length; i++) s[i] = 0.003 * Math.sin(i * 1.3); // noise floor, about -50 dBFS
    const burst = (from: number, to: number) => {
      for (let i = from * rate; i < to * rate; i++) s[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / rate);
    };
    burst(0.5, 1.0);
    burst(1.1, 1.4); // a 100 ms pause: bridged
    burst(2.0, 2.5);
    const speech = speechFromPeaks(computeMinMax(s, rate, 200));
    expect(speech.map((i) => [i.start, i.end])).toEqual([
      [0.5, 1.4],
      [2.0, 2.5],
    ]);
  });
});

describe("coverage", () => {
  it("counts overlapping stages once", () => {
    expect(
      coverage([
        { start: 0, end: 1 },
        { start: 0.5, end: 1.5 },
        { start: 2, end: 2.5 },
      ]),
    ).toBeCloseTo(2);
  });
});
