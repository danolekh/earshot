/* Where a reply's wait went. The wait itself is measured on the recording, from the end of the
 * caller's speech to the agent's first sound; the spans are the explanation, stage by stage, and
 * whatever they don't cover is reported as unexplained rather than spread over the stages. */

import { measuredSpeech } from "./speech";
import type { CallTrace, Interval, TraceSpan, TraceTurn } from "./types";

export type LatencyStageKind = "endpointing" | "stt" | "llm" | "tool" | "tts";

export interface LatencyStage {
  kind: LatencyStageKind;
  /** What to call it: the tool's name, the model... */
  label: string;
  start: number;
  end: number;
  spanId?: string;
  /** Placed from a figure the stack reported, not from a span: stages laid end to end from the
   * caller's last word, so where each sits is a guess, only its length is known. */
  reported?: true;
}

export interface LatencyBreakdown {
  /** The agent turn. */
  turnId: string;
  /** The caller turn it answers. */
  replyTo: string;
  /** t = 0: the end of the caller's speech. */
  anchor: number;
  /** The agent's first sound. */
  start: number;
  /** `start - anchor`, what the caller waited. */
  measured: number;
  /** What the pipeline reported for the same wait, when it did. */
  reported?: number;
  stages: readonly LatencyStage[];
  /** The time the stages cover (overlaps counted once). */
  accounted: number;
  /** `measured - accounted`: transport, buffering, queueing, or a stage nobody traced. */
  unexplained: number;
}

/** When a stage's first token or byte arrived (seconds since the call's start): off the span, or
 * the first nested span of the same kind that says (`llm_node` > `llm_request`). */
function firstChunkAt(span: TraceSpan, nested: readonly TraceSpan[]): number | undefined {
  return [span, ...nested].find((s) => s.firstChunk !== undefined)?.firstChunk;
}

/** When a caller turn's speech ended: from the recording's voice activity when the trace has it,
 * else from its words, else the turn's end. */
export function speechEnd(trace: CallTrace, turn: TraceTurn): number {
  const intervals = measuredSpeech(trace, turn.channel) ?? [];
  let end = -Infinity;
  for (const i of intervals) if (i.start < turn.end && i.end > turn.start) end = Math.max(end, i.end);
  if (end > -Infinity) return Math.min(end, turn.end + 0.3);
  const words = trace.words.filter((w) => w.turnId === turn.id && w.source !== "tts");
  const aligned = words.filter((w) => w.source === "aligned");
  const last = (aligned.length ? aligned : words).at(-1);
  return last?.end ?? turn.end;
}

/** The nearest ancestor of `s` of the same kind, among `spans`. */
function sameKindParent(s: TraceSpan, byId: ReadonlyMap<string, TraceSpan>): TraceSpan | undefined {
  for (
    let p = s.parentId ? byId.get(s.parentId) : undefined;
    p;
    p = p.parentId ? byId.get(p.parentId) : undefined
  )
    if (p.kind === s.kind) return p;
  return undefined;
}

/** Spans of `kind` not nested inside another span of the same kind (`llm_node` over
 * `llm_request` over `llm_request_run` counts once), each with the same-kind spans inside it. */
function outermost(
  spans: readonly TraceSpan[],
  kind: TraceSpan["kind"],
): { span: TraceSpan; nested: TraceSpan[] }[] {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const top = spans.filter((s) => s.kind === kind && !sameKindParent(s, byId));
  return top.map((span) => ({
    span,
    nested: spans.filter((s) => {
      for (let p = sameKindParent(s, byId); p; p = sameKindParent(p, byId)) if (p === span) return true;
      return false;
    }),
  }));
}

/** Total length of a set of intervals, overlaps counted once. */
export function coverage(intervals: readonly Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let from = -Infinity;
  let to = -Infinity;
  for (const i of sorted) {
    if (i.start > to) {
      if (to > from) total += to - from;
      from = i.start;
      to = i.end;
    } else to = Math.max(to, i.end);
  }
  if (to > from) total += to - from;
  return total;
}

/** An agent turn's wait, split into the stages the spans explain. Undefined for a turn that
 * answers nothing (the greeting) or that started before the caller finished. */
export function latencyBreakdown(trace: CallTrace, agentTurnId: string): LatencyBreakdown | undefined {
  const turn = trace.turns.find((t) => t.id === agentTurnId);
  const asked = turn?.replyTo ? trace.turns.find((t) => t.id === turn.replyTo) : undefined;
  if (!turn || !asked) return undefined;
  const anchor = speechEnd(trace, asked);
  const start = turn.start;
  if (start <= anchor) return undefined;
  const clip = (s: number, e: number) => ({ start: Math.max(anchor, s), end: Math.min(start, e) });
  const stages: LatencyStage[] = [];
  const push = (kind: LatencyStageKind, label: string, s: number, e: number, spanId?: string) => {
    const c = clip(s, e);
    if (c.end > c.start) stages.push({ kind, label, ...c, ...(spanId !== undefined && { spanId }) });
  };

  const eou = outermost(
    trace.spans.filter((s) => s.turnId === asked.id),
    "eou",
  ).filter(({ span }) => span.end <= start + 0.05);
  const lastEou = eou.at(-1)?.span;
  if (lastEou) push("endpointing", "End of turn", lastEou.start, lastEou.end, lastEou.id);

  const own = trace.spans.filter((s) => s.turnId === turn.id && s.start < start);
  for (const [i, { span, nested }] of outermost(own, "llm").entries()) {
    const first =
      firstChunkAt(span, nested) ??
      (i === 0 && turn.latency?.llmTtft !== undefined ? span.start + turn.latency.llmTtft : undefined);
    const model = [span, ...nested].find((s) => s.llm?.model)?.llm?.model;
    push("llm", model ?? "LLM", span.start, first ?? span.end, span.id);
  }
  for (const { span } of outermost(own, "tool"))
    push("tool", span.tool?.name ?? span.name, span.start, span.end, span.id);
  const tts = outermost(own, "tts")[0];
  if (tts) {
    const first =
      firstChunkAt(tts.span, tts.nested) ??
      (turn.latency?.ttsTtfb !== undefined ? tts.span.start + turn.latency.ttsTtfb : undefined);
    push("tts", "TTS", tts.span.start, first ?? tts.span.end, tts.span.id);
  }

  // A stack that reports figures instead of tracing spans (ElevenLabs Agents): the stages end to
  // end from the caller's last word, around any tool call it did trace.
  if (!stages.some((x) => x.kind === "llm" || x.kind === "tts")) {
    const l = turn.latency ?? {};
    let at = anchor;
    const figure = (kind: LatencyStageKind, label: string, seconds: number | undefined, spanId?: string) => {
      if (seconds === undefined || seconds <= 0) return;
      const c = clip(at, at + seconds);
      if (c.end > c.start)
        stages.push({ kind, label, ...c, ...(spanId !== undefined && { spanId }), reported: true });
      at += seconds;
    };
    figure("stt", "Transcription", l.transcription);
    figure("llm", turn.context?.model ?? "LLM", l.llmTtft);
    // A tool call only placed by a rough time (a whole second) goes in the chain by its length; one
    // that was traced stays where it was.
    const guessed = (x: LatencyStage) => trace.spans.find((s) => s.id === x.spanId)?.estimated === true;
    const tools = stages.filter((x) => x.kind === "tool");
    for (const t of tools.filter(guessed)) {
      stages.splice(stages.indexOf(t), 1);
      const span = trace.spans.find((s) => s.id === t.spanId)!;
      figure("tool", t.label, span.end - span.start, span.id);
    }
    const traced = tools.filter((x) => !guessed(x));
    if (traced.length) at = Math.max(at, ...traced.map((x) => x.end));
    else if (!tools.length) figure("tool", "Tools", l.tool);
    figure("tts", "TTS", l.ttsTtfb);
  }

  stages.sort((a, b) => a.start - b.start);
  const measured = start - anchor;
  const accounted = coverage(stages);
  return {
    turnId: turn.id,
    replyTo: asked.id,
    anchor,
    start,
    measured,
    ...(turn.latency?.e2e !== undefined && { reported: turn.latency.e2e }),
    stages,
    accounted,
    unexplained: Math.max(0, measured - accounted),
  };
}

/** Unexplained time shorter than this (seconds) isn't worth a row. */
export const UNEXPLAINED_MIN = 0.01;

export type LatencyRowKind = LatencyStageKind | "unexplained";

/** A row of a reply's wait: a stage, or the time nothing explains (placed at the end). */
export interface LatencyRow extends Omit<LatencyStage, "kind"> {
  kind: LatencyRowKind;
}

/** A breakdown's stages, then its unexplained time when there's enough of it. */
export function latencyRows(b: LatencyBreakdown): LatencyRow[] {
  return [
    ...b.stages,
    ...(b.unexplained >= UNEXPLAINED_MIN
      ? [
          {
            kind: "unexplained" as const,
            label: "Unexplained (transport, buffering, untraced)",
            start: b.start - b.unexplained,
            end: b.start,
          },
        ]
      : []),
  ];
}
