/* The alignment gate: do a chunk's word timings sit on its speech? Speech is found fine-grained on
 * the clean chunk (5 ms bins, anything within 30 dB of its loudest, pauses under 100 ms bridged),
 * so a word stretched over a real pause, or pushed a word along, shows up as speech missing under
 * it. The gate judges the words as they're written, after refineToSpeech has fitted their edges to
 * this same speech, so coverage, onset and tail mostly confirm the fit; what still catches a word
 * in the wrong place is a pause under it, a word off speech, or words out of order (the fit only
 * trims edges, by at most a quarter second). Pure functions, tested in quality.test.ts. */
import { computeMinMax } from "@danolekh/earshot/core";
import { type Interval, speechFromPeaks } from "@danolekh/earshot/trace";

import { keyOf, type TimedWord } from "./timing.ts";

export interface GateThresholds {
  /** Share of all word time that falls on speech. */
  coverage: number;
  /** How far the first word may start from the first speech. */
  onset: number;
  /** How far the last word may end from the last speech. */
  tail: number;
  /** Share of each word's time that falls on speech. */
  word: number;
  /** Words shorter than this... */
  short: number;
  /** ...need this share on speech. */
  shortWord: number;
  /** A pause at least this long must not lie under a word. */
  gap: number;
}

export const THRESHOLDS: GateThresholds = {
  coverage: 0.85,
  onset: 0.1,
  tail: 0.2,
  word: 0.5,
  short: 0.06,
  shortWord: 0.8,
  gap: 0.15,
};

/** Speech in a chunk, fine-grained, for judging word timings. */
export function speechOf(samples: Float32Array, sampleRate: number): Interval[] {
  const level = computeMinMax(samples, sampleRate, 200);
  let loudest = 0;
  for (let i = 0; i < level.min.length; i++) loudest = Math.max(loudest, -level.min[i]!, level.max[i]!);
  const peakDb = 20 * Math.log10(Math.max(loudest, 1) / 127);
  return speechFromPeaks(level, {
    floorPercentile: 0,
    openDb: 0,
    minDb: peakDb - 30,
    bridge: 0.1,
    minSpeech: 0.03,
  });
}

const onSpeech = (w: { start: number; end: number }, speech: readonly Interval[]) =>
  speech.reduce((sum, s) => sum + Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start)), 0);

export interface GateResult {
  coverage: number;
  onset: number;
  tail: number;
  flags: string[];
}

export function checkAlignment(
  words: readonly TimedWord[],
  speech: readonly Interval[],
  t: GateThresholds = THRESHOLDS,
): GateResult {
  const timed = words.filter((w) => keyOf(w.text));
  if (!timed.length || !speech.length)
    return { coverage: 0, onset: 0, tail: 0, flags: ["no words or no speech"] };
  const flags: string[] = [];
  const total = timed.reduce((sum, w) => sum + (w.end - w.start), 0);
  const on = timed.reduce((sum, w) => sum + onSpeech(w, speech), 0);
  const coverage = total > 0 ? on / total : 0;
  const onset = timed[0]!.start - speech[0]!.start;
  const tail = timed.at(-1)!.end - speech.at(-1)!.end;
  const s = (v: number) => v.toFixed(2);
  if (coverage < t.coverage) flags.push(`coverage ${s(coverage)}`);
  if (Math.abs(onset) > t.onset) flags.push(`onset ${s(onset)} s`);
  if (Math.abs(tail) > t.tail) flags.push(`tail ${s(tail)} s`);
  timed.forEach((w, i) => {
    const length = w.end - w.start;
    if (length <= 0) flags.push(`zero-length "${w.text}"`);
    else {
      const share = onSpeech(w, speech) / length;
      if (length < t.short && share < t.shortWord)
        flags.push(`short "${w.text}" ${Math.round(length * 1000)} ms`);
      else if (share < t.word) flags.push(`off speech "${w.text}" ${s(share)}`);
    }
    if (i > 0 && w.start < timed[i - 1]!.end - 0.01) flags.push(`order "${w.text}"`);
  });
  // A word laid over a real pause: at least 0.1 s of a pause of `gap` or more (the aligner's 80 ms
  // steps can put a correct word's edge a little into one).
  for (let k = 1; k < speech.length; k++) {
    const gap = { start: speech[k - 1]!.end, end: speech[k]!.start };
    if (gap.end - gap.start < t.gap) continue;
    const over = timed.find((w) => Math.min(w.end, gap.end) - Math.max(w.start, gap.start) >= 0.1);
    if (over) flags.push(`pause in "${over.text}" ${s(gap.start)}–${s(gap.end)}`);
  }
  return { coverage, onset, tail, flags };
}

/** The gate's table: one row per chunk, flags last. */
export function formatReport(rows: readonly ({ line: string } & GateResult)[]): string {
  const pad = (v: string, n: number) => v.padEnd(n);
  return rows
    .map(
      (r) =>
        `  ${r.flags.length ? "✗" : "✓"} ${pad(r.line, 16)} coverage ${r.coverage.toFixed(2)}  onset ${r.onset.toFixed(2)}  tail ${r.tail.toFixed(2)}${r.flags.length ? `  ${r.flags.join("; ")}` : ""}`,
    )
    .join("\n");
}
