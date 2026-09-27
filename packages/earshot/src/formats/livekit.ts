/* LiveKit Agents traces in, a call trace out. LiveKit instruments every session with OpenTelemetry
 * spans (the same ones behind LiveKit Cloud's Agent insights): `agent_session`, then `user_turn`
 * (with `eou_wait` > `eou_detection`) and `agent_turn` (with `llm_node` > `llm_request`,
 * `function_tool`, `tts_node` > `tts_request`, `agent_speaking`), carrying `lk.*` and `gen_ai.*`
 * attributes. Its recorder writes caller and agent on one wall clock, so spans line up with the
 * audio by subtracting the recording's start. Names checked against livekit/agents 1.8; content
 * attributes moved to `lk.pii.*` in 1.7, so both spellings are read. */

import type {
  Attributes,
  AttributeValue,
  CallMeta,
  CallTrace,
  Channel,
  SignalType,
  SpanKind,
} from "../trace/types";
import { normalizeChat } from "./chat";
import {
  compactLatency as compact,
  jsonValue as json,
  numberValue as num,
  spanTree,
  stringValue as str,
  toSpanDraft,
} from "./otel";
import { readOtlpSpans, type OtlpSpan, type OtlpTraces } from "./otlp";
import {
  type ClockAnchor,
  readCall,
  type SignalDraft,
  type Source,
  type SpanDraft,
  type TurnDraft,
} from "./read";
import { callMeta, recording } from "./sources";

/** What each LiveKit span name is. Anything else is kept as `other`. */
export const LIVEKIT_SPAN_KINDS: Readonly<Record<string, SpanKind>> = {
  agent_session: "session",
  user_turn: "user_turn",
  eou_wait: "eou",
  eou_detection: "eou",
  agent_turn: "agent_turn",
  llm_node: "llm",
  llm_request: "llm",
  llm_request_run: "llm",
  realtime_inference: "llm",
  function_tool: "tool",
  tts_node: "tts",
  tts_request: "tts",
  tts_request_run: "tts",
  agent_speaking: "playout",
};

/** The session report LiveKit Agents builds at the end of a job (`make_session_report`), as far as
 * a trace needs it. `events` may also carry the app's own events (`consent`, `disclosure`...),
 * which become signals of that type. */
export interface LiveKitSessionReport {
  room?: string;
  room_id?: string;
  job_id?: string;
  sdk_version?: string;
  /** Unix seconds. */
  audio_recording_started_at?: number;
  started_at?: number;
  events?: readonly { type: string; created_at: number; [key: string]: unknown }[];
}

export interface LiveKitInput {
  otlp: OtlpTraces | readonly OtlpTraces[];
  report?: LiveKitSessionReport;
  recording?: { startedAtUnixMs?: number; sources?: readonly { src: string; type: string }[] };
  call?: Partial<CallMeta>;
}

const kindOf = (name: string): SpanKind => LIVEKIT_SPAN_KINDS[name] ?? (/stt/.test(name) ? "stt" : "other");

/** An `lk.` attribute under either spelling: `lk.pii.<name>` (1.7+) or `lk.<name>`. */
function lk(attrs: Attributes, name: string): AttributeValue | undefined {
  return attrs[`lk.pii.${name}`] ?? attrs[`lk.${name}`];
}

const SIGNAL_TYPES = new Set<SignalType>([
  "consent",
  "disclosure",
  "dtmf",
  "transfer",
  "amd_verdict",
  "error",
]);

/** A LiveKit session as a source: its turns, spans and turn-taking signals, from the spans and the
 * session report. Time 0 is the report's note of when the recording started, else the session's
 * start, else the first span; a `recording` source with the recording's own start wins over both. */
export function livekit(input: Pick<LiveKitInput, "otlp" | "report">): Source {
  const raw = readOtlpSpans(input.otlp);
  const { ancestor, children, within } = spanTree(raw);
  const session = raw.find((s) => s.name === "agent_session");
  const started = input.report?.audio_recording_started_at;
  const anchors: ClockAnchor[] = [
    ...(started !== undefined
      ? [{ unixNs: BigInt(Math.round(started * 1e6)) * 1000n, rank: "report" as const }]
      : []),
    ...(session ? [{ unixNs: session.start, rank: "session" as const }] : []),
    ...(raw[0] ? [{ unixNs: raw[0].start, rank: "first" as const }] : []),
  ];
  return {
    name: "livekit",
    anchors,
    read(ctx) {
      const sec = ctx.fromUnixNs;
      // Turns: the caller's from `user_turn` (speech ends where the end-of-turn wait begins), the
      // agent's from `agent_turn`, placed where its audio played (`agent_speaking`).
      const turns: TurnDraft[] = [];
      for (const s of raw) {
        if (s.name === "user_turn") {
          // Speech ends where the committed end-of-turn wait began (a caller pausing mid-sentence
          // has earlier waits the detector let go).
          const waits = children(s, "eou_wait");
          const wait =
            waits.find((w) => str(lk(w.attributes, "eou.outcome")) === "committed") ?? waits.at(-1);
          const confidence = num(lk(s.attributes, "transcript_confidence"));
          turns.push({
            key: s.spanId,
            channel: "caller",
            start: sec(s.start),
            end: sec(wait?.start ?? s.end),
            text: str(lk(s.attributes, "user_transcript")) ?? "",
            ...(confidence !== undefined && { confidence }),
            latency: compact({
              endOfTurn: num(lk(s.attributes, "end_of_turn_delay")),
              transcription: num(lk(s.attributes, "transcription_delay")),
            }),
          });
        } else if (s.name === "agent_turn") {
          const playout = within(s, "agent_speaking")[0];
          if (!playout) continue;
          const llm = within(s, "llm_request")[0];
          const tts = within(s, "tts_request");
          const tools = within(s, "function_tool");
          const speechId = str(lk(s.attributes, "speech_id")) ?? str(lk(playout.attributes, "speech_id"));
          const interrupted =
            lk(s.attributes, "interrupted") === true || lk(playout.attributes, "interrupted") === true;
          const text =
            tts
              .map((t) => str(lk(t.attributes, "input_text")) ?? "")
              .join(" ")
              .trim() ||
            str(lk((llm ?? s).attributes, "response.text")) ||
            "";
          const model = str(llm?.attributes["gen_ai.request.model"]);
          turns.push({
            key: s.spanId,
            channel: "agent",
            start: sec(playout.start),
            end: sec(playout.end),
            text,
            ...(speechId !== undefined && { speechId }),
            ...(interrupted && { interrupted: { at: sec(playout.end) } }),
            latency: compact({
              e2e: num(lk(s.attributes, "e2e_latency")),
              endOfTurn: num(lk(s.attributes, "end_of_turn_delay")),
              transcription: num(lk(s.attributes, "transcription_delay")),
              llmTtft: llm && num(lk(llm.attributes, "response.ttft")),
              ttsTtfb: tts[0] && num(lk(tts[0].attributes, "response.ttfb")),
              tool: tools.length ? tools.reduce((n, t) => n + Number(t.end - t.start) / 1e9, 0) : undefined,
            }),
            ...(model !== undefined && { context: { model } }),
          });
        }
      }

      const turnOf = (s: OtlpSpan) =>
        (s.name === "user_turn" || s.name === "agent_turn" ? s : ancestor(s, ["user_turn", "agent_turn"]))
          ?.spanId;
      const spans: SpanDraft[] = raw.map((s) => {
        const kind = kindOf(s.name);
        const isError = lk(s.attributes, "function_tool.is_error") === true;
        const toolName = str(lk(s.attributes, "function_tool.name"));
        const callId = str(lk(s.attributes, "function_tool.id"));
        const turnKey = turnOf(s);
        const ttft = num(lk(s.attributes, "response.ttft")) ?? num(lk(s.attributes, "response.ttfb"));
        const model = str(s.attributes["gen_ai.request.model"]);
        const messages = normalizeChat(lk(s.attributes, "chat_ctx"));
        const output = str(lk(s.attributes, "response.text"));
        const calls = json(lk(s.attributes, "response.function_calls"));
        const toolCalls = Array.isArray(calls)
          ? calls.flatMap((c: { name?: unknown; arguments?: unknown; call_id?: unknown }) =>
              typeof c?.name === "string"
                ? [
                    {
                      ...(typeof c.call_id === "string" && { id: c.call_id }),
                      name: c.name,
                      arguments: c.arguments,
                    },
                  ]
                : [],
            )
          : [];
        const llm = {
          ...(model !== undefined && { model }),
          ...(messages && { messages }),
          ...(output !== undefined && { output }),
          ...(toolCalls.length > 0 && { toolCalls }),
        };
        return toSpanDraft(s, ctx, {
          kind,
          ...(turnKey !== undefined && { turnKey }),
          ...(ttft !== undefined && { firstChunk: ctx.fromUnixNs(s.start) + ttft }),
          ...(Object.keys(llm).length > 0 && { llm }),
          ...(isError &&
            s.status.code !== "error" && {
              status: {
                code: "error" as const,
                message: String(json(lk(s.attributes, "function_tool.output")) ?? "error"),
              },
            }),
          ...(kind === "tool" && {
            tool: {
              name: toolName ?? s.name,
              ...(callId !== undefined && { callId }),
              arguments: json(lk(s.attributes, "function_tool.arguments")),
              result: json(lk(s.attributes, "function_tool.output")),
              isError,
            },
          }),
        });
      });

      const signals: SignalDraft[] = [];
      for (const wait of raw.filter((s) => s.name === "eou_wait")) {
        const detection = children(wait, "eou_detection").at(-1);
        const outcome = str(lk(wait.attributes, "eou.outcome"));
        const owner = ancestor(wait, ["user_turn"]);
        const threshold = num(lk((detection ?? wait).attributes, "eou.unlikely_threshold"));
        const probability = num(lk((detection ?? wait).attributes, "eou.probability"));
        signals.push({
          type: "eou_decision",
          at: sec(wait.end),
          channel: "caller",
          ...(owner && { turnKey: owner.spanId }),
          data: {
            ...(probability !== undefined && { probability }),
            wait: num(lk(wait.attributes, "eou.wait_duration")) ?? Number(wait.end - wait.start) / 1e9,
            outcome: outcome === "user_resumed" || outcome === "dropped" ? outcome : "committed",
            ...(threshold !== undefined && { threshold }),
          },
        });
      }
      const speaking: Record<Channel, number | undefined> = { caller: undefined, agent: undefined };
      for (const e of input.report?.events ?? []) {
        const at = ctx.fromUnixSeconds(e.created_at);
        if (e.type === "user_state_changed" || e.type === "agent_state_changed") {
          const channel: Channel = e.type === "user_state_changed" ? "caller" : "agent";
          const state = String(e.new_state ?? "");
          if (channel === "agent") signals.push({ type: "agent_state", at, channel, data: { state } });
          if (state === "speaking") speaking[channel] = at;
          else if (speaking[channel] !== undefined) {
            if (channel === "caller")
              signals.push({ type: "vad_speech", at: speaking[channel]!, end: at, channel });
            speaking[channel] = undefined;
          }
        } else if (e.type === "agent_false_interruption") {
          signals.push({
            type: "false_interruption",
            at,
            channel: "caller",
            data: { resumed: e.resumed === true },
          });
        } else if (SIGNAL_TYPES.has(e.type as SignalType)) {
          const data = Object.fromEntries(
            Object.entries(e).filter(([k]) => k !== "type" && k !== "created_at"),
          );
          signals.push({ type: e.type, at, data } as SignalDraft);
        }
      }

      const sdk = input.report?.sdk_version ?? str(session?.resource["telemetry.sdk.version"]);
      const id = input.report?.room ?? session?.traceId;
      return {
        call: {
          ...(id !== undefined && { id }),
          versions: { ...(sdk !== undefined && { sdk: `livekit-agents ${sdk}` }) },
        },
        clock: { channels: ["caller", "agent"], sampleRate: 48_000 },
        turns,
        spans,
        signals,
      };
    },
  };
}

/** A call trace from a LiveKit session's spans, and its session report and recording when there
 * are. Word timings aren't in the spans, so words are spread over their turns and marked
 * `estimated`; `mergeAnalysis` (or a `timedWords` source) replaces them. */
export function fromLiveKit(input: LiveKitInput): CallTrace {
  return readCall(
    livekit(input),
    recording(input.recording ?? {}),
    ...(input.call ? [callMeta(input.call)] : []),
  );
}
