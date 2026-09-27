import { describe, expect, it } from "vitest";

import { keyOf, mapUnits, refineToSpeech } from "./timing.ts";

const u = (text: string, start: number, end: number) => ({ text, start, end });
const said = (text: string) => text.split(" ");

describe("keyOf", () => {
  it("ignores case, punctuation, accents and how they're encoded", () => {
    expect(keyOf("Ordnung.")).toBe("ordnung");
    expect(keyOf("Zählerstand")).toBe(keyOf("Zählerstand"));
    expect(keyOf("E-Mail")).toBe("email");
    expect(keyOf("don’t")).toBe(keyOf("don't"));
  });
});

describe("mapUnits", () => {
  it("puts the script's words, punctuation and all, on the aligner's timings", () => {
    const { words, exact } = mapUnits(said("Ja, das ist in Ordnung."), [
      u("Ja", 0, 0.32),
      u("das", 0.48, 0.72),
      u("ist", 0.72, 1.04),
      u("in", 1.04, 1.2),
      u("Ordnung", 1.2, 1.76),
    ]);
    expect(exact).toBe(true);
    expect(words.map((w) => [w.text, w.start, w.end])).toEqual([
      ["Ja,", 0, 0.32],
      ["das", 0.48, 0.72],
      ["ist", 0.72, 1.04],
      ["in", 1.04, 1.2],
      ["Ordnung.", 1.2, 1.76],
    ]);
  });

  it("joins units the aligner split, and shares a unit it merged", () => {
    expect(
      mapUnits(said("Zwölf dreiundvierzig."), [
        u("Zwölf", 0, 0.4),
        u("dreiund", 0.4, 0.8),
        u("vierzig", 0.8, 1.2),
      ]).words[1],
    ).toMatchObject({
      text: "dreiundvierzig.",
      start: 0.4,
      end: 1.2,
    });
    const merged = mapUnits(said("E Mail bitte"), [u("EMail", 0, 0.6), u("bitte", 0.6, 1)]);
    expect(merged.exact).toBe(true);
    expect(merged.words.map((w) => [w.text, w.start, +w.end.toFixed(2)])).toEqual([
      ["E", 0, 0.12],
      ["Mail", 0.12, 0.6],
      ["bitte", 0.6, 1],
    ]);
  });

  it("gives a punctuation-only token no length, where the word before it ends", () => {
    const { words } = mapUnits(said("Hallo — da?"), [u("Hallo", 0, 0.5), u("da", 0.7, 0.9)]);
    expect(words[1]).toMatchObject({ text: "—", start: 0.5, end: 0.5 });
  });

  it("spreads words it can't match over their gap, marked estimated", () => {
    const { words, exact } = mapUnits(said("vier sieben eins"), [u("vier", 0, 0.3), u("eins", 0.9, 1.2)]);
    expect(exact).toBe(false);
    expect(words[1]).toMatchObject({ text: "sieben", estimated: true });
    expect(words[1]!.start).toBeGreaterThanOrEqual(0.3);
    expect(words[1]!.end).toBeLessThanOrEqual(0.9);
  });

  it("keeps times in order and never below zero (after the trim's lead is taken off)", () => {
    const { words } = mapUnits(said("Ja das"), [u("Ja", -0.05, 0.2), u("das", 0.15, 0.4)]);
    expect(words[0]!.start).toBe(0);
    expect(words[1]!.start).toBeGreaterThanOrEqual(words[0]!.end);
  });
});

describe("refineToSpeech", () => {
  const speech = [
    { start: 0.03, end: 0.3 },
    { start: 0.5, end: 1.1 },
  ];

  it("pulls 80 ms steps in to the speech under each word", () => {
    const words = refineToSpeech([u("Ja,", 0, 0.4), u("das", 0.48, 0.8), u("ist", 0.8, 1.04)], speech);
    expect(words.map((w) => [w.text, w.start, w.end])).toEqual([
      ["Ja,", 0.03, 0.3],
      ["das", 0.5, 0.8],
      ["ist", 0.8, 1.1],
    ]);
  });

  it("leaves a real pause inside a word, moving an edge no more than `reach`", () => {
    const [w] = refineToSpeech([u("Ordnung", 0, 1.6)], speech, 0.25);
    expect(w).toMatchObject({ start: 0.03, end: 1.35 });
  });

  it("gives a word the aligner left no length a share of the word before, marked estimated", () => {
    const words = refineToSpeech([u("Unter", 0.5, 0.8), u("der", 0.8, 0.8), u("Nummer", 0.8, 1.1)], speech);
    expect(words[1]).toMatchObject({ text: "der", estimated: true });
    expect(words[0]!.end).toBe(words[1]!.start);
    expect(words[1]!.end - words[1]!.start).toBeGreaterThan(0.05);
  });
});
