/* A call trace from any stack, as layers. Each source (a provider's export, the recording, a
 * reference transcript) supplies the parts of a call it knows; `readCall` puts them on one clock,
 * merges them, and derives what none of them gave (derive.ts). A provider is only a source, so the
 * same call reads the same whichever stack recorded it, and a new stack is one more source.
 *
 * The clock: every source may offer when the call's time 0 is (an anchor), ranked by how sure it
 * is. The recording's own start wins, because spans are placed on its waveform; then a report's
 * note of it, a session span's start, and the first thing recorded. Sources read their times
 * through the context, relative to that t0. */
import { createTrace } from "../trace/trace";
import type {
  CallMeta,
  CallTrace,
  Finding,
  TraceAudio,
  TraceClock,
  TraceSignal,
  TraceSpan,
  TraceTurn,
  TraceWord,
  WithoutId,
} from "../trace/types";
import { deriveTrace } from "./derive";

/** How sure an anchor is of time 0, surest first. */
export const CLOCK_RANKS: readonly ["recording", "report", "session", "first"] = [
  "recording",
  "report",
  "session",
  "first",
];
export type ClockRank = (typeof CLOCK_RANKS)[number];

/** When a source says the call's time 0 is, in Unix nanoseconds. */
export interface ClockAnchor {
  unixNs: bigint;
  rank: ClockRank;
}

/** What every source reads its times through: seconds since t0, to the microsecond. */
export interface ReadContext {
  /** Unix nanoseconds of time 0. */
  readonly t0: bigint;
  fromUnixNs(ns: bigint): number;
  fromUnixSeconds(s: number): number;
  fromUnixMs(ms: number): number;
}

/** A turn's edge a source had to guess. */
export type TurnEdge = "start" | "end";

/** A turn as a source knows it: a key of its own instead of an id (ids are given once every turn is
 * known), and which edges it guessed. */
export type TurnDraft = Omit<TraceTurn, "id" | "replyTo" | "estimated"> & {
  key: string;
  /** The key of the caller turn it answers, when the source knows. */
  replyTo?: string;
  estimated?: readonly TurnEdge[];
};

/** Anything tied to a turn, by the turn's key. */
interface Keyed {
  turnKey?: string;
}
export type SpanDraft = WithoutId<TraceSpan> & Keyed;
export type SignalDraft = WithoutId<TraceSignal> & Keyed;
export type WordDraft = WithoutId<TraceWord> & Keyed;
export type FindingDraft = Omit<Finding, "id" | "turnId" | "evidence"> &
  Keyed & { id?: string; evidence?: readonly string[] };

/** The parts of a call one source knows. */
export interface CallPart {
  call?: Partial<CallMeta>;
  clock?: Partial<Omit<TraceClock, "t0UnixMs">>;
  audio?: Partial<TraceAudio>;
  speech?: CallTrace["speech"];
  turns?: readonly TurnDraft[];
  spans?: readonly SpanDraft[];
  signals?: readonly SignalDraft[];
  words?: readonly WordDraft[];
  findings?: readonly FindingDraft[];
}

/** One layer of a call: a provider's export, the recording, a transcript... */
export interface Source {
  /** Who it is ("livekit", "recording"). The source that gives the turns names the call's stack. */
  readonly name: string;
  readonly anchors?: readonly ClockAnchor[];
  read(ctx: ReadContext): CallPart;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function readContext(t0: bigint): ReadContext {
  const t0Seconds = Number(t0 / 1000n) / 1e6;
  return {
    t0,
    fromUnixNs: (ns) => round6(Number(ns - t0) / 1e9),
    fromUnixSeconds: (s) => round6(s - t0Seconds),
    fromUnixMs: (ms) => round6(ms / 1000 - t0Seconds),
  };
}

/** Time 0: the surest anchor any source offers (the first, among equally sure ones). */
export function clockStart(sources: readonly Source[]): bigint {
  let best: ClockAnchor | undefined;
  for (const s of sources)
    for (const a of s.anchors ?? [])
      if (!best || CLOCK_RANKS.indexOf(a.rank) < CLOCK_RANKS.indexOf(best.rank)) best = a;
  return best?.unixNs ?? 0n;
}

/** Every part of a call, merged from its sources in order. */
export interface MergedCall {
  call: Partial<CallMeta> & { id: string };
  clock: TraceClock;
  audio?: TraceAudio;
  speech?: CallTrace["speech"];
  /** The source that gave the turns. */
  owner?: string;
  turns: readonly TurnDraft[];
  spans: readonly SpanDraft[];
  signals: readonly SignalDraft[];
  words: readonly WordDraft[];
  findings: readonly FindingDraft[];
}

const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Merges the parts: call and clock fields from the last source to give them (versions per key),
 * the turns from exactly one source, spans, signals and findings from all, and words replaced per
 * channel and source, as `mergeAnalysis` does. */
export function mergeParts(parts: readonly { name: string; part: CallPart }[], t0: bigint): MergedCall {
  const t0Ms = Number(t0 / 1000n) / 1000;
  let call: Partial<CallMeta> & { id: string } = { id: "call", startedAt: new Date(t0Ms).toISOString() };
  let clock: TraceClock = { t0UnixMs: t0Ms, channels: [] };
  let audio: TraceAudio | undefined;
  let speech: CallTrace["speech"];
  let owner: string | undefined;
  let turns: readonly TurnDraft[] = [];
  const spans: SpanDraft[] = [];
  const signals: SignalDraft[] = [];
  const findings: FindingDraft[] = [];
  let words: WordDraft[] = [];
  for (const { name, part } of parts) {
    if (part.call) {
      const { versions, ...rest } = part.call;
      call = { ...call, ...defined(rest) };
      if (versions) call.versions = { ...call.versions, ...versions };
    }
    if (part.clock) clock = { ...clock, ...defined(part.clock) };
    if (part.audio) {
      const peaks = { ...audio?.peaks, ...part.audio.peaks };
      audio = {
        sources: part.audio.sources ?? audio?.sources ?? [],
        ...(Object.keys(peaks).length > 0 && { peaks }),
      };
    }
    if (part.speech) speech = { ...speech, ...part.speech };
    if (part.turns) {
      if (owner !== undefined) throw new Error(`both ${owner} and ${name} give the call's turns`);
      owner = name;
      turns = part.turns;
    }
    spans.push(...(part.spans ?? []));
    signals.push(...(part.signals ?? []));
    findings.push(...(part.findings ?? []));
    if (part.words?.length) {
      const replaced = new Set(part.words.map((w) => `${w.channel}:${w.source}`));
      words = [...words.filter((w) => !replaced.has(`${w.channel}:${w.source}`)), ...part.words];
    }
  }
  // The stack is whoever gave the turns, unless a source says otherwise.
  if (call.provider === undefined && owner !== undefined) call = { ...call, provider: owner };
  return {
    call,
    clock,
    ...(audio && { audio }),
    ...(speech && { speech }),
    ...(owner !== undefined && { owner }),
    turns,
    spans,
    signals,
    words,
    findings,
  };
}

/** One call trace from its sources: on one clock, merged, with what none gave derived. */
export function readCall(...sources: readonly Source[]): CallTrace {
  const t0 = clockStart(sources);
  const ctx = readContext(t0);
  return createTrace(
    deriveTrace(
      mergeParts(
        sources.map((s) => ({ name: s.name, part: s.read(ctx) })),
        t0,
      ),
    ),
  );
}
