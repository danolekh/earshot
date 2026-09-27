/* Putting a script's own words on an aligner's timings. The script keeps its spelling and
 * punctuation ("Ja," "Ordnung."); the aligner only says where each word it heard starts and ends.
 * Pure functions, tested in timing.test.ts. */
import type { Word } from "@danolekh/earshot/core";

/** A word with timings from somewhere else than an aligner match: spread over the gap it sits in. */
export type TimedWord = Word & { estimated?: boolean };

/** One unit an aligner timed (a word, as it split the text), in seconds. */
export interface Unit {
  text: string;
  start: number;
  end: number;
}

export const clean = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** What two spellings of a word have in common: letters and digits, without accents or case, so
 * "Zählerstand" matches however its umlaut is encoded and "E-Mail" matches "EMail". */
export const keyOf = (w: string): string =>
  w
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** The script's words on another source's timings, by anchoring on words both agree on and
 * sharing the time between two anchors by length. The fallback when an aligner's units don't line
 * up with the script (and whisper's way of timing words). */
export function align(said: string[], heard: { text: string; start: number; end: number }[]): Word[] {
  const anchors: [number, number][] = [];
  let h = 0;
  said.forEach((w, i) => {
    for (let k = h; k < Math.min(heard.length, h + 4); k++)
      if (clean(heard[k]!.text) === clean(w)) {
        anchors.push([i, k]);
        h = k + 1;
        return;
      }
  });
  const out: Word[] = new Array(said.length);
  for (const [i, k] of anchors) out[i] = { text: said[i]!, start: heard[k]!.start, end: heard[k]!.end };
  const bounds: [number, number][] = [[-1, -1], ...anchors, [said.length, heard.length]];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const [i0, k0] = bounds[b]!;
    const [i1, k1] = bounds[b + 1]!;
    if (i1 - i0 <= 1) continue;
    const from = heard[k0 + 1]?.start ?? heard[k0]?.end ?? 0;
    const to = heard[k1 - 1]?.end ?? heard[k1]?.start ?? from + (i1 - i0 - 1) * 0.3;
    const words = said.slice(i0 + 1, i1);
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    let t = from;
    words.forEach((w, n) => {
      const d = ((w.length + 1) / total) * Math.max(0.05, to - from);
      out[i0 + 1 + n] = { text: w, start: t, end: t + d * 0.92 };
      t += d;
    });
  }
  return out.map((w) => ({ ...w, start: Math.max(0, w.start), end: Math.max(w.start + 0.02, w.end) }));
}

/** The script's tokens on a forced aligner's units, walking both in order: a unit per token when
 * they agree; a token over several units when the aligner split a word; several tokens sharing a
 * unit by length when it merged them. Tokens of only punctuation sit, zero-length, where the word
 * before them ends. If anything is left over, the tokens that didn't match are spread over their
 * gap and marked `estimated`, and `exact` is false. Times come out in order and never negative. */
export function mapUnits(
  said: readonly string[],
  units: readonly Unit[],
): { words: TimedWord[]; exact: boolean } {
  const keys = said.map(keyOf);
  const heard = units.filter((u) => keyOf(u.text));
  const unitKeys = heard.map((u) => keyOf(u.text));
  const out: (TimedWord | undefined)[] = new Array(said.length);
  let i = 0;
  let j = 0;
  walk: while (i < said.length && j < heard.length) {
    if (!keys[i]) {
      i++;
      continue;
    }
    if (keys[i] === unitKeys[j]) {
      out[i] = { text: said[i]!, start: heard[j]!.start, end: heard[j]!.end };
      i++;
      j++;
      continue;
    }
    // The aligner split one of the script's words.
    for (let n = 2; n <= 3 && j + n <= heard.length; n++)
      if (unitKeys.slice(j, j + n).join("") === keys[i]) {
        out[i] = { text: said[i]!, start: heard[j]!.start, end: heard[j + n - 1]!.end };
        i++;
        j += n;
        continue walk;
      }
    // The aligner merged several of the script's words.
    for (let n = 2; n <= 3 && i + n <= said.length; n++) {
      const group = keys.slice(i, i + n);
      if (group.join("") !== unitKeys[j]) continue;
      const unit = heard[j]!;
      const total = group.reduce((sum, k) => sum + Math.max(1, k.length), 0);
      let t = unit.start;
      for (let k = 0; k < n; k++) {
        const d = ((unit.end - unit.start) * Math.max(1, group[k]!.length)) / total;
        out[i + k] = { text: said[i + k]!, start: t, end: t + d };
        t += d;
      }
      i += n;
      j++;
      continue walk;
    }
    break;
  }
  const missing = keys.some((k, n) => k && !out[n]);
  const exact = !missing && j >= heard.length;
  if (missing) {
    // Each run of unmatched words shares the time between the timed words around it, by length.
    for (let n = 0; n < said.length; n++) {
      if (!keys[n] || out[n]) continue;
      let m = n;
      while (m < said.length && (!keys[m] || !out[m])) m++;
      const run = said
        .slice(n, m)
        .map((_, k) => n + k)
        .filter((k) => keys[k]);
      const before = out.slice(0, n).findLast((w) => w !== undefined);
      const after = out[m];
      const from = before?.end ?? heard[0]?.start ?? 0;
      const to = after?.start ?? heard.at(-1)?.end ?? from + run.length * 0.3;
      const total = run.reduce((sum, k) => sum + keys[k]!.length + 1, 0);
      let t = from;
      for (const k of run) {
        const d = ((keys[k]!.length + 1) / total) * Math.max(0, to - from);
        out[k] = { text: said[k]!, start: t, end: t + d * 0.92, estimated: true };
        t += d;
      }
      n = m;
    }
  }
  let previous = 0;
  const words = said.map((text, n): TimedWord => {
    const w = out[n] ?? { text, start: previous, end: previous };
    const start = Math.max(0, previous, w.start);
    const end = Math.max(start, w.end);
    previous = keys[n] ? end : previous;
    return { ...w, text, start, end };
  });
  return { words, exact };
}

interface Span {
  start: number;
  end: number;
}

/** An aligner's words fitted to the speech under them, which it only places in 80 ms steps: each
 * word pulled in to the speech inside it (by at most `reach` per edge, so a real pause inside a
 * word stays), an end that stops short of the speech it's in carried to that speech's end when
 * it's close and the next word hasn't started, and a word left with no length given its share of
 * the word before it (marked estimated). */
export function refineToSpeech(
  words: readonly TimedWord[],
  speech: readonly Span[],
  reach = 0.25,
): TimedWord[] {
  const overlap = (a: Span, b: Span) => Math.min(a.end, b.end) - Math.max(a.start, b.start);
  const out = words.map((w) => ({ ...w }));
  const timed = out.filter((w) => keyOf(w.text));
  timed.forEach((w, i) => {
    const under = speech.filter((s) => overlap(w, s) > 0.02);
    if (under.length) {
      w.start = Math.max(w.start, Math.min(under[0]!.start, w.start + reach));
      w.end = Math.min(w.end, Math.max(under.at(-1)!.end, w.end - reach));
    }
    const next = timed[i + 1];
    const inside = speech.find((s) => w.end > s.start && w.end < s.end);
    if (inside && inside.end - w.end <= 0.12 && (!next || next.start >= inside.end)) w.end = inside.end;
    if (w.end - w.start < 0.03 && i > 0) {
      const prev = timed[i - 1]!;
      const share = keyOf(w.text).length / (keyOf(prev.text).length + keyOf(w.text).length);
      const cut = prev.end - (prev.end - prev.start) * share;
      w.start = cut;
      w.end = Math.max(w.end, prev.end);
      prev.end = cut;
      w.estimated = true;
    }
  });
  return out;
}
