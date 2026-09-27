/* How alike two sentences are, for spotting an agent that asks the same thing twice: cosine
 * similarity of their character trigrams, which tolerates inflection and a word added or dropped
 * ("Können Sie die Nummer nennen?" / "Können Sie die Nummer noch einmal nennen?"). */

const normalize = (text: string): string =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function trigrams(text: string): Map<string, number> {
  const s = ` ${normalize(text)} `;
  const out = new Map<string, number>();
  for (let i = 0; i + 3 <= s.length; i++) {
    const g = s.slice(i, i + 3);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** 0 (nothing shared) to 1 (the same, ignoring case and punctuation). */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  let dot = 0;
  let nx = 0;
  let ny = 0;
  for (const [g, n] of x) {
    nx += n * n;
    dot += n * (y.get(g) ?? 0);
  }
  for (const n of y.values()) ny += n * n;
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}

/** A turn's text split into sentences. */
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const wordCount = (text: string): number => normalize(text).split(" ").filter(Boolean).length;
