import type { OtlpKeyValue, OtlpSpanJson, OtlpTraces } from "../formats/otlp";
import { createTrace } from "../trace/trace";
import type {
  CallMeta,
  CallTrace,
  Channel,
  Interval,
  TraceSignal,
  TraceSpan,
  TraceTurn,
  TraceWord,
  WithoutId,
} from "../trace/types";

/** The recording's first sample, in Unix ms (a fraction on purpose) and ns. */
export const T0_MS = 1_790_414_042_250.5;
export const T0_NS = 1_790_414_042_250_500_000n;

const ns = (seconds: number): string => (T0_NS + BigInt(Math.round(seconds * 1e6)) * 1000n).toString();

function kv(attrs: Record<string, string | number | boolean>): OtlpKeyValue[] {
  return Object.entries(attrs).map(([key, v]) => ({
    key,
    value:
      typeof v === "string"
        ? { stringValue: v }
        : typeof v === "boolean"
          ? { boolValue: v }
          : Number.isInteger(v)
            ? { intValue: String(v) }
            : { doubleValue: v },
  }));
}

/** An OTLP/JSON span `start`..`end` seconds after the recording began. */
export function otlpSpan(
  id: string,
  name: string,
  start: number,
  end: number,
  options: { parent?: string; attrs?: Record<string, string | number | boolean>; error?: string } = {},
): OtlpSpanJson {
  return {
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: id.padStart(16, "0"),
    ...(options.parent && { parentSpanId: options.parent.padStart(16, "0") }),
    name,
    startTimeUnixNano: ns(start),
    endTimeUnixNano: ns(end),
    attributes: kv(options.attrs ?? {}),
    ...(options.error && { status: { code: 2, message: options.error } }),
  };
}

export const otlpExport = (spans: OtlpSpanJson[]): OtlpTraces => ({
  resourceSpans: [
    {
      resource: { attributes: kv({ "service.name": "voice-agent", "telemetry.sdk.version": "1.8.3" }) },
      scopeSpans: [{ scope: { name: "livekit-agents" }, spans }],
    },
  ],
});

/** A LiveKit session: the caller asks, the agent looks it up (the tool fails), starts answering
 * and is cut off by the caller. One tool attribute uses the pre-1.7 spelling (`lk.X`, not
 * `lk.pii.X`). */
export const livekitTwoTurns: OtlpTraces = otlpExport([
  otlpSpan("1", "agent_session", 0, 6),
  otlpSpan("2", "user_turn", 1, 2.75, {
    parent: "1",
    attrs: { "lk.pii.user_transcript": "Wo ist meine Bestellung?", "lk.transcript_confidence": 0.93 },
  }),
  otlpSpan("3", "eou_wait", 2.4, 2.75, {
    parent: "2",
    attrs: { "lk.eou.outcome": "committed", "lk.eou.wait_duration": 0.35 },
  }),
  otlpSpan("4", "eou_detection", 2.45, 2.5, { parent: "3", attrs: { "lk.eou.probability": 0.91 } }),
  otlpSpan("5", "agent_turn", 2.75, 6, {
    parent: "1",
    attrs: { "lk.speech_id": "speech_a1", "lk.e2e_latency": 1.2, "lk.interrupted": true },
  }),
  otlpSpan("6", "llm_node", 2.75, 3.4, { parent: "5" }),
  otlpSpan("7", "llm_request", 2.76, 3.4, {
    parent: "6",
    attrs: { "gen_ai.request.model": "gpt-4.1", "lk.response.ttft": 0.29 },
  }),
  otlpSpan("8", "function_tool", 3.05, 3.35, {
    parent: "5",
    attrs: {
      "lk.function_tool.name": "lookup_order",
      "lk.function_tool.id": "call_1",
      "lk.function_tool.arguments": '{"id":"A1"}',
      "lk.pii.function_tool.output": "404 not found",
      "lk.function_tool.is_error": true,
    },
  }),
  otlpSpan("9", "tts_node", 3.4, 5.9, { parent: "5" }),
  otlpSpan("a", "tts_request", 3.4, 5.9, {
    parent: "9",
    attrs: { "lk.response.ttfb": 0.12, "lk.pii.input_text": "Ich finde die Bestellung leider nicht." },
  }),
  otlpSpan("b", "agent_speaking", 3.6, 4.8, { parent: "5" }),
  otlpSpan("c", "user_turn", 4.3, 5.5, { parent: "1", attrs: { "lk.pii.user_transcript": "Warten Sie" } }),
  otlpSpan("d", "eou_wait", 5.2, 5.5, { parent: "c", attrs: { "lk.eou.outcome": "committed" } }),
]);

type TurnExtra = Partial<Omit<TraceTurn, "id" | "channel" | "start" | "end" | "text">>;

export interface TraceBuilder {
  caller(id: string, start: number, end: number, text: string, extra?: TurnExtra): TraceBuilder;
  agent(id: string, start: number, end: number, text: string, extra?: TurnExtra): TraceBuilder;
  /** Words spread evenly over `[start, end]`, with per-word extras in order. */
  words(
    turnId: string,
    source: TraceWord["source"],
    text: string,
    start: number,
    end: number,
    extra?: Partial<TraceWord>[],
  ): TraceBuilder;
  span(span: WithoutId<TraceSpan>): TraceBuilder;
  signal(signal: WithoutId<TraceSignal>): TraceBuilder;
  speech(channel: Channel, intervals: Interval[]): TraceBuilder;
  build(): CallTrace;
}

/** A small trace, built up a call at a time, for detector tests. Without `speech`, detectors
 * take speech from the turns. */
export function traceBuilder(call: Partial<CallMeta> = {}): TraceBuilder {
  const turns: TraceTurn[] = [];
  const spans: WithoutId<TraceSpan>[] = [];
  const signals: WithoutId<TraceSignal>[] = [];
  const words: WithoutId<TraceWord>[] = [];
  let speech: Partial<Record<Channel, Interval[]>> | undefined;
  const builder: TraceBuilder = {
    caller(id: string, start: number, end: number, text: string, extra: TurnExtra = {}) {
      turns.push({ id, channel: "caller", start, end, text, ...extra });
      return builder;
    },
    agent(id: string, start: number, end: number, text: string, extra: TurnExtra = {}) {
      turns.push({ id, channel: "agent", start, end, text, ...extra });
      return builder;
    },
    words(
      turnId: string,
      source: TraceWord["source"],
      text: string,
      start: number,
      end: number,
      extra: Partial<TraceWord>[] = [],
    ) {
      const parts = text.split(" ");
      const step = (end - start) / parts.length;
      const turn = turns.find((t) => t.id === turnId)!;
      parts.forEach((p, i) =>
        words.push({
          channel: turn.channel,
          source,
          text: p,
          start: start + i * step,
          end: start + (i + 0.9) * step,
          turnId,
          ...extra[i],
        }),
      );
      return builder;
    },
    span(span: WithoutId<TraceSpan>) {
      spans.push(span);
      return builder;
    },
    signal(signal: WithoutId<TraceSignal>) {
      signals.push(signal);
      return builder;
    },
    speech(channel: Channel, intervals: Interval[]) {
      speech = { ...speech, [channel]: intervals };
      return builder;
    },
    build(): CallTrace {
      return createTrace({
        call: { id: "test", language: "de-DE", ...call },
        clock: { t0UnixMs: 0, channels: ["caller", "agent"] },
        turns,
        spans,
        signals,
        words,
        ...(speech && { speech }),
      });
    },
  };
  return builder;
}
