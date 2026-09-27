/* Helpers for providers that trace with OpenTelemetry: walking the span tree, reading attribute
 * values, and turning an OTLP span into a trace span. Plain helpers, not a framework: LiveKit and
 * Pipecat shape a call differently (a span per side's turn, against one per exchange), so each
 * provider says for itself what its spans mean. */
import type {
  AttributeValue,
  LlmCall,
  SpanKind,
  SpanStatus,
  ToolInvocation,
  TurnLatency,
} from "../trace/types";
import type { OtlpSpan } from "./otlp";
import type { ReadContext, SpanDraft } from "./read";

export interface SpanTree {
  byId: ReadonlyMap<string, OtlpSpan>;
  /** The nearest ancestor with one of these names. */
  ancestor(s: OtlpSpan, names: readonly string[]): OtlpSpan | undefined;
  /** The direct children with this name. */
  children(s: OtlpSpan, name: string): OtlpSpan[];
  /** The span itself and its descendants with this name (not those under a nested span of the
   * same name as `s`). */
  within(s: OtlpSpan, name: string): OtlpSpan[];
}

export function spanTree(spans: readonly OtlpSpan[]): SpanTree {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const ancestor = (s: OtlpSpan, names: readonly string[]): OtlpSpan | undefined => {
    for (let p = s.parentSpanId ? byId.get(s.parentSpanId) : undefined; p;)
      if (names.includes(p.name)) return p;
      else p = p.parentSpanId ? byId.get(p.parentSpanId) : undefined;
    return undefined;
  };
  return {
    byId,
    ancestor,
    children: (s, name) => spans.filter((c) => c.parentSpanId === s.spanId && c.name === name),
    within: (s, name) => spans.filter((c) => c.name === name && (c === s || ancestor(c, [s.name]) === s)),
  };
}

export const numberValue = (v: AttributeValue | undefined): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export const stringValue = (v: AttributeValue | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

/** A JSON-encoded attribute (tool arguments, outputs), parsed when it parses. */
export function jsonValue(v: AttributeValue | undefined): unknown {
  if (typeof v !== "string") return v ?? undefined;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** The latency fields that have a value. */
export const compactLatency = (latency: { [K in keyof TurnLatency]?: number | undefined }): TurnLatency =>
  Object.fromEntries(Object.entries(latency).filter(([, v]) => v !== undefined)) as TurnLatency;

/** An OTLP span as a trace span: its ids, times on the call's clock, the emitting process, its
 * attributes and events as they were. */
export function toSpanDraft(
  s: OtlpSpan,
  ctx: ReadContext,
  extra: {
    kind: SpanKind;
    turnKey?: string;
    status?: SpanStatus;
    tool?: ToolInvocation;
    firstChunk?: number;
    llm?: LlmCall;
    estimated?: boolean;
  },
): SpanDraft {
  const service = stringValue(s.resource["service.name"]);
  return {
    id: s.spanId,
    traceId: s.traceId,
    ...(s.parentSpanId && { parentId: s.parentSpanId }),
    name: s.name,
    kind: extra.kind,
    start: ctx.fromUnixNs(s.start),
    end: ctx.fromUnixNs(s.end),
    ...(extra.turnKey !== undefined && { turnKey: extra.turnKey }),
    ...(service !== undefined && { process: service }),
    status: extra.status ?? s.status,
    ...(extra.tool && { tool: extra.tool }),
    ...(extra.firstChunk !== undefined && { firstChunk: extra.firstChunk }),
    ...(extra.llm && { llm: extra.llm }),
    ...(extra.estimated && { estimated: true }),
    attributes: s.attributes,
    ...(s.events.length > 0 && {
      events: s.events.map((e) => ({ name: e.name, at: ctx.fromUnixNs(e.at), attributes: e.attributes })),
    }),
  };
}
