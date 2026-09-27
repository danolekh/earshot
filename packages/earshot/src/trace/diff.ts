/* What the agent heard against what was said, word by word: a longest-common-subsequence diff, with
 * a dropped word next to an inserted one reported as one changed word. */

import type { TraceWord } from "./types";

export type DiffOp<T> =
  | { op: "same"; a: T; b: T }
  | { op: "changed"; a: T; b: T }
  | { op: "extra"; a: T }
  | { op: "missing"; b: T };

/** Word text compared loosely: case, punctuation and surrounding space ignored. */
export const normalizeToken = (text: string): string =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** The edits from `a` to `b`: `extra` is only in `a`, `missing` only in `b`. */
export function diffTokens<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): DiffOp<T>[] {
  const n = a.length;
  const m = b.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = eq(a[i]!, b[j]!) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const raw: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) raw.push({ op: "same", a: a[i++]!, b: b[j++]! });
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) raw.push({ op: "extra", a: a[i++]! });
    else raw.push({ op: "missing", b: b[j++]! });
  }
  while (i < n) raw.push({ op: "extra", a: a[i++]! });
  while (j < m) raw.push({ op: "missing", b: b[j++]! });

  // Between two matches, pair extras with missings in order: those are substitutions.
  const out: DiffOp<T>[] = [];
  for (let k = 0; k < raw.length;) {
    if (raw[k]!.op === "same") {
      out.push(raw[k++]!);
      continue;
    }
    const extras: T[] = [];
    const missings: T[] = [];
    for (; k < raw.length && raw[k]!.op !== "same"; k++) {
      const d = raw[k]!;
      if (d.op === "extra") extras.push(d.a);
      else if (d.op === "missing") missings.push(d.b);
    }
    const pairs = Math.min(extras.length, missings.length);
    for (let p = 0; p < pairs; p++) out.push({ op: "changed", a: extras[p]!, b: missings[p]! });
    for (const x of extras.slice(pairs)) out.push({ op: "extra", a: x });
    for (const y of missings.slice(pairs)) out.push({ op: "missing", b: y });
  }
  return out;
}

export interface WordDiff {
  op: "same" | "changed" | "extra" | "missing";
  /** The word as the agent heard it (streaming recognition). */
  heard?: TraceWord;
  /** The word as it was said (aligned to the recording). */
  said?: TraceWord;
}

/** How what the agent heard differs from what was said. */
export function diffWords(heard: readonly TraceWord[], said: readonly TraceWord[]): WordDiff[] {
  return diffTokens(heard, said, (x, y) => normalizeToken(x.text) === normalizeToken(y.text)).map((d) => {
    switch (d.op) {
      case "same":
      case "changed":
        return { op: d.op, heard: d.a, said: d.b };
      case "extra":
        return { op: "extra", heard: d.a };
      case "missing":
        return { op: "missing", said: d.b };
    }
  });
}

/** What the agent heard on a caller turn against what was said there. */
export interface HeardDiff {
  turnId: string;
  heard: readonly TraceWord[];
  said: readonly TraceWord[];
  ops: readonly WordDiff[];
}

/** A caller turn's words as heard (streaming recognition) against as said (aligned), or undefined
 * when either side has none. */
export function heardDiff(trace: { words: readonly TraceWord[] }, turnId: string): HeardDiff | undefined {
  const heard = trace.words.filter((w) => w.turnId === turnId && w.source === "streaming_asr");
  const said = trace.words.filter((w) => w.turnId === turnId && w.source === "aligned");
  if (!heard.length || !said.length) return undefined;
  return { turnId, heard, said, ops: diffWords(heard, said) };
}

/** The positions, among the words said, of those the agent didn't hear as said. */
export function missedSaid(d: HeardDiff): ReadonlySet<number> {
  const out = new Set<number>();
  for (const op of d.ops) if (op.op !== "same" && op.said) out.add(d.said.indexOf(op.said));
  out.delete(-1);
  return out;
}
