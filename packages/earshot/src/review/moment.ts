/* A moment in a call, as a link carries it: the time, the zoom, and what's picked. Opening at a
 * finding or turn starts a little before it, so what leads up to it is heard. Anything that
 * doesn't parse is dropped rather than trusted. */

export interface Moment {
  /** Seconds. */
  t?: number;
  /** The view, in seconds. */
  from?: number;
  to?: number;
  turn?: string;
  span?: string;
  finding?: string;
}

/** How long before a moment playback starts (seconds). */
export const LEAD_IN = 0.3;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A moment opening just before `start`, picking a turn or a finding. */
export function momentFor(
  target: { start: number; turn?: string; finding?: string },
  leadIn: number = LEAD_IN,
): Moment {
  return {
    ...(target.finding !== undefined && { finding: target.finding }),
    ...(target.turn !== undefined && { turn: target.turn }),
    t: Math.max(0, round2(target.start - leadIn)),
  };
}

const time = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 86_400 ? round2(n) : undefined;
};
const id = (v: unknown): string | undefined =>
  typeof v === "string" && /^[\w:.-]{1,80}$/.test(v) ? v : undefined;

/** A moment from a link's query: times within a day, to the hundredth; a view only when it's one;
 * ids of the shape earshot gives. */
export function parseMoment(raw: Record<string, unknown>): Moment {
  const out: Moment = {};
  const t = time(raw.t);
  const from = time(raw.from);
  const to = time(raw.to);
  if (t !== undefined) out.t = t;
  if (from !== undefined && to !== undefined && to > from) Object.assign(out, { from, to });
  for (const key of ["turn", "span", "finding"] as const) {
    const v = id(raw[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** The finding a moment is at: from a lead-in before it to its end (at least a beat after its
 * start), so landing where a link or a hop puts you still names it. */
export function findingAt<F extends { start: number; end: number }>(
  findings: readonly F[],
  t: number,
  leadIn: number = LEAD_IN,
): F | undefined {
  return findings.find((f) => t >= f.start - leadIn - 0.05 && t <= Math.max(f.end, f.start + 0.3));
}
