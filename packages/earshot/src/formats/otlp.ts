/* OpenTelemetry traces as OTLP/JSON (what a collector's file exporter writes, and what an OTLP/HTTP
 * JSON request carries), read into flat spans. Timestamps stay nanoseconds as bigint: Unix
 * nanoseconds are past 2^53, and a number would lose the sub-millisecond part. */

import type { AttributeValue, Attributes, SpanStatus } from "../trace/types";

export interface OtlpAnyValue {
  stringValue?: string;
  /** A string in OTLP/JSON, since 64-bit integers don't fit a JSON number. */
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: readonly OtlpAnyValue[] };
  kvlistValue?: { values?: readonly OtlpKeyValue[] };
  bytesValue?: string;
}

export interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

export interface OtlpSpanJson {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number | string;
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: readonly OtlpKeyValue[];
  events?: readonly { timeUnixNano: string | number; name: string; attributes?: readonly OtlpKeyValue[] }[];
  status?: { code?: number | string; message?: string };
}

export interface OtlpTraces {
  resourceSpans?: readonly {
    resource?: { attributes?: readonly OtlpKeyValue[] };
    scopeSpans?: readonly {
      scope?: { name?: string; version?: string };
      spans?: readonly OtlpSpanJson[];
    }[];
  }[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  /** Unix nanoseconds. */
  start: bigint;
  end: bigint;
  attributes: Attributes;
  events: readonly { name: string; at: bigint; attributes: Attributes }[];
  status: SpanStatus;
  /** The emitting process's resource attributes (`service.name`...). */
  resource: Attributes;
  scope?: string;
}

/** An OTLP value as plain JSON. */
export function anyValue(v: OtlpAnyValue | undefined): AttributeValue {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(anyValue);
  if (v.kvlistValue) return attributes(v.kvlistValue.values);
  if (v.bytesValue !== undefined) return v.bytesValue;
  return null;
}

export function attributes(list: readonly OtlpKeyValue[] | undefined): Attributes {
  const out: Record<string, AttributeValue> = {};
  for (const kv of list ?? []) out[kv.key] = anyValue(kv.value);
  return out;
}

const nanos = (v: string | number): bigint => BigInt(typeof v === "number" ? Math.round(v) : v);

function status(s: OtlpSpanJson["status"]): SpanStatus {
  const code = s?.code;
  const kind =
    code === 2 || code === "STATUS_CODE_ERROR"
      ? "error"
      : code === 1 || code === "STATUS_CODE_OK"
        ? "ok"
        : "unset";
  return { code: kind, ...(s?.message && { message: s.message }) };
}

/** Every span in one export or several, flattened, in start order. */
export function readOtlpSpans(json: OtlpTraces | readonly OtlpTraces[]): OtlpSpan[] {
  const exports: readonly OtlpTraces[] = Array.isArray(json) ? json : [json as OtlpTraces];
  const out: OtlpSpan[] = [];
  for (const e of exports)
    for (const rs of e.resourceSpans ?? []) {
      const resource = attributes(rs.resource?.attributes);
      for (const ss of rs.scopeSpans ?? [])
        for (const s of ss.spans ?? [])
          out.push({
            traceId: s.traceId,
            spanId: s.spanId,
            ...(s.parentSpanId && { parentSpanId: s.parentSpanId }),
            name: s.name,
            start: nanos(s.startTimeUnixNano),
            end: nanos(s.endTimeUnixNano),
            attributes: attributes(s.attributes),
            events: (s.events ?? []).map((ev) => ({
              name: ev.name,
              at: nanos(ev.timeUnixNano),
              attributes: attributes(ev.attributes),
            })),
            status: status(s.status),
            resource,
            ...(ss.scope?.name && { scope: ss.scope.name }),
          });
    }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Seconds from `t0` (Unix nanoseconds) to `ns`, exact to the nanosecond before the division. */
export const secondsSince = (ns: bigint, t0: bigint): number => Number(ns - t0) / 1e9;
