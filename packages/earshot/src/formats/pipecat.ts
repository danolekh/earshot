/* Pipecat in, as a source. Pipecat traces a call with OpenTelemetry (`PipelineWorker(enable_tracing=
 * True)`): a `conversation` span, a `turn` span per exchange (the caller speaking, then the bot
 * answering), and under it `stt`, `llm` and `tts` spans on the wall clock. That's enough for the
 * turns and their text, the model's input and output, and first-token times, but not for when
 * anyone actually spoke: an `stt` span starts where speech began and ends at the final transcript,
 * and `tts` spans time synthesis, not playback. Tool calls get no spans; they show up in the next
 * `llm` span's input, so they're worked out, between the two requests.
 *
 * Pipecat's observers fill that in, when their events are kept (as JSON, one per line):
 * `SpeakingObserver` says when each side really spoke and when the turn detector let go, and
 * `FunctionCallObserver` times each tool call and says how it went. A `recording_started` event
 * (the wall time `AudioBufferProcessor` began) puts time 0 on the recording, which is stereo:
 * caller left, bot right. Names checked against pipecat main (v1.12). */
import type { Attributes, AttributeValue, CallMeta, CallTrace, ChatMessage, SpanKind } from "../trace/types";
import { normalizeChat } from "./chat";
import { jsonValue, numberValue as num, spanTree, stringValue as str, toSpanDraft } from "./otel";
import { readOtlpSpans, type OtlpSpan, type OtlpTraces } from "./otlp";
import {
  type ClockAnchor,
  type ReadContext,
  readCall,
  type SignalDraft,
  type Source,
  type SpanDraft,
  type TurnDraft,
} from "./read";
import { callMeta, recording, type RecordingInput } from "./sources";

/** What each Pipecat span name is. */
export const PIPECAT_SPAN_KINDS: Readonly<Record<string, SpanKind>> = {
  conversation: "session",
  turn: "other",
  stt: "stt",
  llm: "llm",
  tts: "tts",
};

/** `SpeakingObserver`'s events. */
export interface PipecatSpeechEvent {
  kind:
    | "user_speech_started"
    | "user_speech_stopped"
    | "user_turn_started"
    | "user_turn_stopped"
    | "bot_speech_started"
    | "bot_speech_stopped"
    | "interruption";
  /** Unix seconds. */
  timestamp: number;
  started_at?: number | null;
}

/** `FunctionCallObserver`'s events. */
export interface PipecatFunctionCallEvent {
  kind:
    | "function_call_started"
    | "function_call_in_progress"
    | "function_call_completed"
    | "function_call_failed"
    | "function_call_timed_out"
    | "function_call_cancelled";
  function_name: string;
  tool_call_id: string;
  timestamp: number;
  arguments?: unknown;
  started_at?: number | null;
  in_progress_at?: number | null;
  result?: unknown;
  error?: string | null;
}

/** When the recording began: `AudioBufferProcessor.start_recording()`'s wall time. */
export interface PipecatRecordingEvent {
  kind: "recording_started";
  timestamp: number;
}

export type PipecatEvent = PipecatSpeechEvent | PipecatFunctionCallEvent | PipecatRecordingEvent;

export interface PipecatInput {
  otlp: OtlpTraces | readonly OtlpTraces[];
  events?: readonly PipecatEvent[];
  /** Whether a tool's result (from the model's next input) means it failed, when no events say. */
  isToolError?: (result: unknown) => boolean;
}

const ns = (s: number) => BigInt(Math.round(s * 1e6)) * 1000n;
const chars = 0.065;

type Reply = { llm: OtlpSpan; tts: OtlpSpan[]; exchange?: OtlpSpan; key: string };

/** A tool result as the model got it: JSON when it parses. */
const resultOf = (content: string): unknown => jsonValue(content);

export function pipecat(input: PipecatInput): Source {
  const raw = readOtlpSpans(input.otlp);
  const tree = spanTree(raw);
  const conversation = raw.find((s) => s.name === "conversation");
  const events = input.events ?? [];
  const recordingStart = events.find((e): e is PipecatRecordingEvent => e.kind === "recording_started");
  const anchors: ClockAnchor[] = [
    ...(recordingStart ? [{ unixNs: ns(recordingStart.timestamp), rank: "recording" as const }] : []),
    ...(conversation ? [{ unixNs: conversation.start, rank: "session" as const }] : []),
    ...(raw[0] ? [{ unixNs: raw[0].start, rank: "first" as const }] : []),
  ];
  return { name: "pipecat", anchors, read: (ctx) => readPipecat(input, raw, tree, events, ctx) };
}

function readPipecat(
  input: PipecatInput,
  raw: readonly OtlpSpan[],
  tree: ReturnType<typeof spanTree>,
  events: readonly PipecatEvent[],
  ctx: ReadContext,
): ReturnType<Source["read"]> {
  const sec = ctx.fromUnixNs;
  const at = ctx.fromUnixSeconds;
  const exchangeOf = (s: OtlpSpan) => tree.ancestor(s, ["turn"]);
  const attr = (s: OtlpSpan, name: string): AttributeValue | undefined => s.attributes[name];
  const firstChunk = (s: OtlpSpan) => {
    const ttfb = num(attr(s, "metrics.ttfb"));
    return ttfb === undefined ? undefined : sec(s.start) + ttfb;
  };

  const speech = events.filter(
    (e): e is PipecatSpeechEvent => !("function_name" in e) && e.kind !== "recording_started",
  );
  const calls = events.filter((e): e is PipecatFunctionCallEvent => "function_name" in e);
  const of = (kind: PipecatSpeechEvent["kind"]) =>
    speech.filter((e) => e.kind === kind).map((e) => at(e.timestamp));
  const userStops = of("user_speech_stopped");
  const botStarts = of("bot_speech_started");
  const botStops = of("bot_speech_stopped");

  // The caller: a turn per final transcript. It began where the recogniser dates the speech; it
  // ended where voice activity stopped, when the events say, else sometime before the transcript.
  const stt = raw.filter((s) => s.name === "stt" && (str(attr(s, "transcript")) ?? "").trim());
  const turns: TurnDraft[] = [];
  for (const s of stt) {
    const start = sec(s.start);
    const done = sec(s.end);
    const stopped = userStops.filter((t) => t > start && t <= done + 0.05).at(-1);
    const model = str(attr(s, "gen_ai.request.model"));
    turns.push({
      key: s.spanId,
      channel: "caller",
      start,
      end: stopped ?? done,
      text: str(attr(s, "transcript"))!.trim(),
      ...(stopped === undefined && { estimated: ["end"] as const }),
      ...(model !== undefined && { context: { stt: model } }),
    });
  }

  // The agent: a turn per model request that was spoken, its text what the `tts` spans after it
  // said, until the next request or transcript.
  const llms = raw.filter((s) => s.name === "llm").sort((a, b) => (a.start < b.start ? -1 : 1));
  const boundaries = [...llms, ...stt].map((s) => s.start).sort((a, b) => (a < b ? -1 : 1));
  const replies: Reply[] = [];
  for (const llm of llms) {
    const next = boundaries.find((b) => b > llm.start);
    const tts = raw
      .filter((s) => s.name === "tts" && s.start >= llm.start && (next === undefined || s.start < next))
      .sort((a, b) => (a.start < b.start ? -1 : 1));
    if (tts.length) replies.push({ llm, tts, exchange: exchangeOf(llm), key: llm.spanId });
  }
  for (const [i, r] of replies.entries()) {
    const text = r.tts
      .map((t) => str(attr(t, "text")) ?? "")
      .join(" ")
      .trim();
    const guessStart = firstChunk(r.tts[0]!) ?? sec(r.tts[0]!.start);
    const nextCaller = turns.find((t) => t.channel === "caller" && t.start > guessStart)?.start;
    const played = botStarts.find(
      (t) => t >= guessStart - 0.5 && (nextCaller === undefined || t < nextCaller),
    );
    const stopped = played === undefined ? undefined : botStops.find((t) => t > played);
    const exchange = r.exchange;
    const last = !replies.slice(i + 1).some((x) => x.exchange === exchange);
    const lasted = exchange && num(attr(exchange, "turn.duration_seconds"));
    const byTurn = last && exchange && lasted !== undefined ? sec(exchange.start) + lasted : undefined;
    const start = played ?? guessStart;
    const end = stopped ?? byTurn ?? start + Math.max(0.3, text.length * chars);
    const cut =
      r.tts.some((t) => attr(t, "tts.interrupted") === true) ||
      (last && exchange !== undefined && attr(exchange, "turn.was_interrupted") === true);
    const model = str(attr(r.llm, "gen_ai.request.model"));
    const e2e =
      exchange && r === replies.find((x) => x.exchange === exchange)
        ? num(attr(exchange, "turn.user_bot_latency_seconds"))
        : undefined;
    const llmTtft = num(attr(r.llm, "metrics.ttfb"));
    const ttsTtfb = num(attr(r.tts[0]!, "metrics.ttfb"));
    const estimated = [
      ...(played === undefined ? (["start"] as const) : []),
      ...(stopped === undefined && byTurn === undefined ? (["end"] as const) : []),
    ];
    turns.push({
      key: r.key,
      channel: "agent",
      start,
      end: Math.max(end, start),
      text,
      ...(cut && { interrupted: { at: Math.max(end, start) } }),
      latency: {
        ...(e2e !== undefined && { e2e }),
        ...(llmTtft !== undefined && { llmTtft }),
        ...(ttsTtfb !== undefined && { ttsTtfb }),
      },
      ...(model !== undefined && { context: { model } }),
      ...(estimated.length > 0 && { estimated }),
    });
  }
  const replyOf = (s: OtlpSpan) =>
    replies.find((r) => r.llm === s || r.tts.includes(s))?.key ??
    // A request that only called tools belongs to the reply that came of it.
    replies.find((r) => r.llm.start > s.start)?.key;

  const spans: SpanDraft[] = raw.map((s) => {
    const kind = PIPECAT_SPAN_KINDS[s.name] ?? "other";
    const turnKey =
      s.name === "stt" ? s.spanId : s.name === "llm" || s.name === "tts" ? replyOf(s) : undefined;
    const first = kind === "llm" || kind === "tts" ? firstChunk(s) : undefined;
    return toSpanDraft(s, ctx, {
      kind,
      ...(turnKey !== undefined && { turnKey }),
      ...(first !== undefined && { firstChunk: first }),
      ...(kind === "llm" && { llm: llmOf(s.attributes) }),
    });
  });

  // Tool calls: from the model's inputs, between the request that asked for them and the next.
  const timed = new Map<string, PipecatFunctionCallEvent>();
  for (const e of calls)
    if (e.kind !== "function_call_started" && e.kind !== "function_call_in_progress")
      timed.set(e.tool_call_id, e);
  const seen = new Set<string>();
  for (const [i, llm] of llms.entries()) {
    const messages = normalizeChat(attr(llm, "input")) ?? [];
    const results = new Map(
      messages.filter((m) => m.role === "tool" && m.toolCallId).map((m) => [m.toolCallId!, m] as const),
    );
    for (const call of messages.flatMap((m) => m.toolCalls ?? [])) {
      const id = call.id ?? `${call.name}@${i}`;
      if (seen.has(id) || timed.has(id)) continue;
      seen.add(id);
      const before = llms[i - 1];
      const result = results.get(id);
      const failed = result && input.isToolError?.(resultOf(result.content));
      spans.push({
        id: `tool:${id}`,
        ...(llm.parentSpanId && { parentId: llm.parentSpanId }),
        name: call.name,
        kind: "tool",
        start: sec(before?.end ?? llm.start),
        end: sec(llm.start),
        ...(replyOf(llm) !== undefined && { turnKey: replyOf(llm)! }),
        status: failed ? { code: "error", message: result.content } : { code: "unset" },
        tool: {
          name: call.name,
          callId: id,
          arguments: call.arguments,
          ...(result && { result: resultOf(result.content) }),
          ...(failed !== undefined && { isError: failed }),
        },
        attributes: {},
        estimated: true,
      });
    }
  }
  // …or timed by the observer, when it was kept.
  for (const e of timed.values()) {
    if (e.kind === "function_call_cancelled") continue;
    const started = calls.find(
      (c) => c.tool_call_id === e.tool_call_id && c.kind === "function_call_started",
    );
    const begin = e.started_at ?? e.in_progress_at ?? started?.timestamp ?? e.timestamp;
    const failed = e.kind !== "function_call_completed";
    const end = at(e.timestamp);
    const reply = turns.find((t) => t.channel === "agent" && t.start >= end - 0.05);
    const args = e.arguments ?? started?.arguments;
    spans.push({
      id: `tool:${e.tool_call_id}`,
      name: e.function_name,
      kind: "tool",
      start: at(begin),
      end,
      ...(reply && { turnKey: reply.key }),
      status: failed
        ? {
            code: "error",
            message: e.error ?? (e.kind === "function_call_timed_out" ? "timed out" : "failed"),
          }
        : { code: "ok" },
      tool: {
        name: e.function_name,
        callId: e.tool_call_id,
        ...(args !== undefined && { arguments: args }),
        ...(e.result !== undefined && { result: e.result }),
        isError: failed,
      },
      attributes: {},
    });
  }
  // Tool time in each reply's latency.
  for (const t of turns)
    if (t.channel === "agent") {
      const tools = spans.filter((s) => s.kind === "tool" && s.turnKey === t.key);
      if (tools.length) t.latency = { ...t.latency, tool: tools.reduce((n, s) => n + (s.end - s.start), 0) };
    }

  const signals: SignalDraft[] = [];
  const callerAt = (t: number) => turns.filter((x) => x.channel === "caller" && x.start <= t + 0.05).at(-1);
  const agentAt = (t: number) =>
    turns.filter((x) => x.channel === "agent" && x.start <= t + 0.05 && x.end >= t - 0.05).at(-1);
  for (const e of speech) {
    const t = at(e.timestamp);
    if (e.kind === "user_speech_stopped" && e.started_at != null)
      signals.push({ type: "vad_speech", at: at(e.started_at), end: t, channel: "caller" });
    else if (e.kind === "user_turn_stopped") {
      // The turn detector let the caller's turn go: from the end of their speech to here.
      const ended = userStops.filter((s) => s <= t + 0.05).at(-1) ?? t;
      const turn = callerAt(ended);
      signals.push({
        type: "eou_decision",
        at: t,
        channel: "caller",
        ...(turn && { turnKey: turn.key }),
        data: { wait: Math.round((t - ended) * 1000) / 1000, outcome: "committed" },
      });
      spans.push({
        name: "user_turn_stopped",
        kind: "eou",
        start: ended,
        end: t,
        ...(turn && { turnKey: turn.key }),
        attributes: {},
      });
    } else if (e.kind === "bot_speech_started" || e.kind === "bot_speech_stopped")
      signals.push({
        type: "agent_state",
        at: t,
        channel: "agent",
        data: { state: e.kind === "bot_speech_started" ? "speaking" : "listening" },
      });
    else if (e.kind === "interruption") {
      const turn = agentAt(t);
      const stop = botStops.find((s) => s >= t);
      signals.push({
        type: "interruption",
        at: t,
        channel: "caller",
        ...(turn && { turnKey: turn.key }),
        data: {
          decision: "stop",
          ...(stop !== undefined && { stopAfter: Math.round((stop - t) * 1000) / 1000 }),
        },
      });
    }
  }

  const conversation = raw.find((s) => s.name === "conversation");
  const id = str(conversation && attr(conversation, "conversation.id"));
  return {
    call: { ...(id !== undefined && { id }), versions: {} },
    turns,
    spans,
    signals,
  };
}

/** A Pipecat `llm` span's model, input (the provider's own message format) and output. */
function llmOf(attrs: Attributes) {
  const model = str(attrs["gen_ai.request.model"]);
  const messages: ChatMessage[] | undefined = normalizeChat(attrs.input);
  const output = str(attrs.output);
  return {
    ...(model !== undefined && { model }),
    ...(messages && { messages }),
    ...(output !== undefined && { output }),
  };
}

/** A call trace from Pipecat's spans, with its observers' events and recording when there are.
 * Words aren't traced, so they're spread over their turns; a `timedWords` source replaces them. */
export function fromPipecat(
  input: PipecatInput & { recording?: RecordingInput; call?: Partial<CallMeta> },
): CallTrace {
  return readCall(
    pipecat(input),
    recording({ channels: ["caller", "agent"], ...input.recording }),
    ...(input.call ? [callMeta(input.call)] : []),
  );
}
