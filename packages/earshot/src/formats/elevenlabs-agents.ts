/* ElevenLabs Agents in, as a source: a conversation as `GET /v1/convai/conversations/{id}` returns
 * it, or the `data` of a `post_call_transcription` webhook. It's a transcript, not a trace: each
 * message says when it started, to the second, and nothing says when it ended or when each word
 * was said; the only durations are a tool call's latency and a few per-message figures (time to
 * the model's first token, to the voice's first byte). The recording is one mixed file, so who
 * spoke over whom can't be heard. A reference transcript and the recording's speech move the
 * messages to where they really were. (The existing `elevenlabs.ts` is ElevenLabs' TTS alignment,
 * a different thing.) */
import type { CallMeta, CallTrace, TurnLatency } from "../trace/types";
import { jsonValue } from "./otel";
import {
  type ClockAnchor,
  type FindingDraft,
  readCall,
  type SignalDraft,
  type Source,
  type SpanDraft,
} from "./read";
import { callMeta, recording, type RecordingInput } from "./sources";
import { type TimedMessage, timedTurns } from "./timed";

type Figure = { elapsed_time?: number } | number;

export interface ElevenLabsMessage {
  role: "user" | "agent";
  message?: string | null;
  /** Whole seconds from the call's start (-1 on some first messages). */
  time_in_call_secs: number;
  interrupted?: boolean;
  ignored_as_backchannel?: boolean;
  source_medium?: "audio" | "dtmf" | "text" | "image" | "file" | null;
  feedback?: { score: "like" | "dislike"; time_in_call_secs?: number } | null;
  tool_calls?: readonly {
    request_id: string;
    tool_name: string;
    params_as_json?: string;
    type?: string;
  }[];
  tool_results?: readonly {
    request_id: string;
    tool_name: string;
    result_value?: string;
    is_error?: boolean;
    tool_latency_secs?: number;
  }[];
  /** `{metrics: {name: {elapsed_time}}}`; older payloads leave out the `metrics` wrapper. */
  conversation_turn_metrics?: { metrics?: Readonly<Record<string, Figure>> } & Readonly<
    Record<string, unknown>
  >;
}

export interface ElevenLabsConversation {
  conversation_id: string;
  agent_id?: string;
  agent_name?: string;
  version_id?: string;
  branch_id?: string;
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs?: number;
    main_language?: string;
    termination_reason?: string;
    phone_call?: { direction?: "inbound" | "outbound" } | null;
    feedback?: Readonly<Record<string, unknown>> | null;
  };
  analysis?: {
    call_successful?: "success" | "failure" | "unknown";
    transcript_summary?: string;
    call_summary_title?: string;
    data_collection_results?: Readonly<Record<string, unknown>>;
    evaluation_criteria_results?: Readonly<Record<string, unknown>>;
  } | null;
  transcript: readonly ElevenLabsMessage[];
}

/** A conversation, or the webhook that carried it. */
export type ElevenLabsInput = ElevenLabsConversation | { type: string; data: ElevenLabsConversation };

const unwrap = (input: ElevenLabsInput): ElevenLabsConversation => ("data" in input ? input.data : input);

/** A per-message figure in seconds, under either shape. */
function figure(m: ElevenLabsMessage, name: string): number | undefined {
  const metrics = m.conversation_turn_metrics;
  const v = (metrics?.metrics?.[name] ?? metrics?.[name]) as Figure | undefined;
  const n = typeof v === "number" ? v : v?.elapsed_time;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function latencyOf(m: ElevenLabsMessage): TurnLatency | undefined {
  const l: TurnLatency = {
    ...(figure(m, "convai_asr_trailing_service_latency") !== undefined && {
      transcription: figure(m, "convai_asr_trailing_service_latency")!,
    }),
    ...(figure(m, "convai_llm_service_ttfb") !== undefined && {
      llmTtft: figure(m, "convai_llm_service_ttfb")!,
    }),
    ...(figure(m, "convai_tts_service_ttfb") !== undefined && {
      ttsTtfb: figure(m, "convai_tts_service_ttfb")!,
    }),
  };
  return Object.keys(l).length ? l : undefined;
}

export function elevenLabsAgents(input: ElevenLabsInput): Source {
  const c = unwrap(input);
  const anchors: ClockAnchor[] = [
    { unixNs: BigInt(Math.round(c.metadata.start_time_unix_secs)) * 1_000_000_000n, rank: "session" },
  ];
  return {
    name: "elevenlabs",
    anchors,
    read() {
      const at = (m: ElevenLabsMessage) => Math.max(0, m.time_in_call_secs);
      const spoken = (m: ElevenLabsMessage) => !!m.message?.trim() && m.source_medium !== "dtmf";
      const keyOf = (i: number) => `m${i}`;
      // A message that only called tools isn't a turn; its figures and tools go to the next reply.
      const replyAfter = (i: number) => {
        for (let j = i; j < c.transcript.length; j++)
          if (c.transcript[j]!.role === "agent" && spoken(c.transcript[j]!)) return keyOf(j);
        return undefined;
      };
      const carried = new Map<string, TurnLatency>();
      const messages: TimedMessage[] = [];
      c.transcript.forEach((m, i) => {
        const l = latencyOf(m);
        if (!spoken(m)) {
          const to = m.role === "agent" ? replyAfter(i) : undefined;
          if (l && to) carried.set(to, { ...carried.get(to), ...l });
          return;
        }
        messages.push({
          key: keyOf(i),
          channel: m.role === "user" ? "caller" : "agent",
          text: m.message!.trim(),
          start: at(m),
          roughStart: true,
          ...(m.interrupted && { interrupted: true }),
          ...(l && { latency: l }),
        });
      });
      for (const msg of messages) {
        const more = carried.get(msg.key);
        if (more) msg.latency = { ...more, ...msg.latency };
      }

      // Tool calls: from the message that asked, for as long as the result says it took.
      const results = new Map(
        c.transcript.flatMap((m) => m.tool_results ?? []).map((r) => [r.request_id, r]),
      );
      const spans: SpanDraft[] = [];
      c.transcript.forEach((m, i) => {
        for (const call of m.tool_calls ?? []) {
          const r = results.get(call.request_id);
          const start = at(m);
          const turnKey = replyAfter(i);
          const failed = r?.is_error === true;
          spans.push({
            id: `tool:${call.request_id}`,
            name: call.tool_name,
            kind: "tool",
            start,
            end: start + (r?.tool_latency_secs ?? 0),
            ...(turnKey !== undefined && { turnKey }),
            status: r
              ? failed
                ? { code: "error", message: r.result_value ?? "failed" }
                : { code: "ok" }
              : { code: "unset" },
            tool: {
              name: call.tool_name,
              callId: call.request_id,
              arguments: jsonValue(call.params_as_json),
              ...(r?.result_value !== undefined && { result: jsonValue(r.result_value) }),
              ...(r && { isError: failed }),
            },
            attributes: {},
            estimated: true,
          });
        }
      });
      for (const msg of messages) {
        const tools = spans.filter((s) => s.turnKey === msg.key);
        if (tools.length)
          msg.latency = { ...msg.latency, tool: tools.reduce((n, s) => n + s.end - s.start, 0) };
      }

      const signals: SignalDraft[] = [];
      const findings: FindingDraft[] = [];
      c.transcript.forEach((m, i) => {
        if (m.source_medium === "dtmf")
          signals.push({ type: "dtmf", at: at(m), channel: "caller", data: { digits: m.message ?? "" } });
        if (m.ignored_as_backchannel && spoken(m))
          signals.push({ type: "backchannel", at: at(m), channel: "caller", turnKey: keyOf(i) });
        if (m.feedback) {
          const t = Math.max(0, m.feedback.time_in_call_secs ?? at(m));
          const disliked = m.feedback.score === "dislike";
          findings.push({
            type: "human_feedback",
            start: t,
            end: t,
            severity: disliked ? "warning" : "info",
            detector: { id: "human_feedback", version: 1 },
            message: disliked ? "Someone disliked this reply" : "Someone liked this reply",
            ...(spoken(m) && { turnKey: keyOf(i) }),
          });
        }
      });

      const a = c.analysis ?? undefined;
      const outcome = {
        ...(a?.call_successful === "success" && { achieved: true }),
        ...(a?.call_successful === "failure" && { achieved: false }),
        ...(a?.call_summary_title && { goal: a.call_summary_title }),
        ...(a?.transcript_summary && { summary: a.transcript_summary }),
        ...(a?.data_collection_results && { data: a.data_collection_results }),
        ...(a?.evaluation_criteria_results && { evaluation: a.evaluation_criteria_results }),
        ...(c.metadata.termination_reason && { terminationReason: c.metadata.termination_reason }),
        ...(c.metadata.feedback && { feedback: c.metadata.feedback }),
      };
      const direction = c.metadata.phone_call?.direction;
      const call: Partial<CallMeta> = {
        id: c.conversation_id,
        ...(c.metadata.call_duration_secs !== undefined && { duration: c.metadata.call_duration_secs }),
        ...(direction && { direction }),
        ...(c.metadata.main_language && { language: c.metadata.main_language }),
        versions: {
          ...((c.agent_name ?? c.agent_id) && { agent: (c.agent_name ?? c.agent_id)! }),
          ...(c.version_id && { version: c.version_id }),
          ...(c.branch_id && { branch: c.branch_id }),
        },
        ...(Object.keys(outcome).length > 0 && { outcome }),
      };
      return { call, turns: timedTurns(messages), spans, signals, findings };
    },
  };
}

/** A call trace from an ElevenLabs Agents conversation and its recording (mono, starting with the
 * call). No words are timed; a `timedWords` source (a second transcription) places them. */
export function fromElevenLabsAgents(input: {
  conversation: ElevenLabsInput;
  recording?: RecordingInput;
  call?: Partial<CallMeta>;
}): CallTrace {
  return readCall(
    elevenLabsAgents(input.conversation),
    recording({ channels: ["mixed"], ...input.recording }),
    ...(input.call ? [callMeta(input.call)] : []),
  );
}
