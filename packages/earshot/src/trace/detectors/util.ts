/* What several detectors need: who was speaking when, where two sides overlapped, whether a word is
 * a number, and a finding in the shared shape. */

import { normalizeToken } from "../diff";
import { measuredSpeech } from "../speech";
import type { CallTrace, Channel, Finding, FindingType, Interval, Severity, TraceWord } from "../types";

/** When a channel had speech: from the recording when the trace has it (its share of a mono one),
 * else from its turns (the agent's up to where it was cut off). */
export function speechOf(trace: CallTrace, channel: Channel): Interval[] {
  const measured = measuredSpeech(trace, channel);
  if (measured) return [...measured];
  return trace.turns
    .filter((t) => t.channel === channel)
    .map((t) => ({ start: t.start, end: Math.min(t.end, t.interrupted?.at ?? Infinity) }))
    .filter((i) => i.end > i.start);
}

/** Why who-spoke-when can't be told apart: the recording is mono (both sides on one channel). */
export function monoOnly(trace: CallTrace): string | undefined {
  return trace.speech?.mixed && !trace.speech.caller && !trace.speech.agent
    ? "a mono recording can't tell whose speech overlapped"
    : undefined;
}

/** Why tool calls can't be judged: every one was worked out, not traced, and none says how it
 * went. */
export function unknownToolResults(trace: CallTrace): string | undefined {
  const tools = trace.spans.filter((s) => s.kind === "tool");
  return tools.length > 0 &&
    tools.every(
      (s) => s.estimated && (s.status?.code ?? "unset") === "unset" && s.tool?.isError === undefined,
    )
    ? "tool results aren't recorded"
    : undefined;
}

/** Where two sets of intervals overlap. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a)
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  return out.sort((p, q) => p.start - q.start);
}

/** The union of intervals, merged. */
export function union(intervals: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const i of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

const NUMBER_WORDS = new Set([
  ..."null eins ein eine zwei zwo drei vier fünf sechs sieben acht neun zehn elf zwölf hundert tausend".split(
    " ",
  ),
  ..."zero oh one two three four five six seven eight nine ten eleven twelve hundred thousand".split(" "),
]);

/** A digit string or a spoken number (German or English): the words a misheard ID is made of. */
export function isNumberWord(text: string): boolean {
  const t = normalizeToken(text);
  return (
    /^\d+$/.test(t) ||
    NUMBER_WORDS.has(t) ||
    /^\p{L}*(zehn|zig|ßig|hundert|tausend)$/u.test(t) ||
    /^(thir|four|fif|six|seven|eigh|nine)teen$|^(twen|thir|for|fif|six|seven|eigh|nine)ty$/.test(t)
  );
}

/** Whether a word belongs to a slot that matters (tagged, or a number). */
export const isCritical = (w: TraceWord): boolean => w.entity !== undefined || isNumberWord(w.text);

export const round = (v: number, digits = 3): number => Math.round(v * 10 ** digits) / 10 ** digits;

/** A finding with the shared fields filled in. */
export function finding(
  detector: { id: FindingType; version: number },
  key: string,
  fields: {
    start: number;
    end: number;
    severity: Severity;
    message: string;
    evidence: readonly string[];
    turnId?: string;
    measured?: Record<string, number>;
  },
): Finding {
  return {
    id: `${detector.id}:${key}`,
    type: detector.id,
    detector: { id: detector.id, version: detector.version },
    ...fields,
    start: round(fields.start),
    end: round(fields.end),
    ...(fields.measured && {
      measured: Object.fromEntries(Object.entries(fields.measured).map(([k, v]) => [k, round(v)])),
    }),
  };
}

/** Seconds, as the message shows them. */
export const secs = (v: number): string => `${v.toFixed(2)} s`;
