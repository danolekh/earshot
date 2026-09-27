/* What a file is, and a call from whatever files a stack exported. A LiveKit session is its spans
 * (OTLP/JSON) and, if kept, its session report; a Pipecat call, its spans and its observers'
 * events; an ElevenLabs Agents call, its conversation (or the webhook carrying it). A call trace
 * is already one. The files are recognised by their shape, so they can be dropped in any order. */
import { runDetectors } from "../trace/detectors";
import type { CallMeta, CallTrace } from "../trace/types";
import { elevenLabsAgents, type ElevenLabsInput } from "./elevenlabs-agents";
import { livekit, type LiveKitSessionReport } from "./livekit";
import type { OtlpTraces } from "./otlp";
import { pipecat, type PipecatEvent } from "./pipecat";
import { readCall, type Source } from "./read";
import { callMeta, recording, type RecordingInput } from "./sources";

export type ExportKind =
  | "call-trace"
  | "livekit-otlp"
  | "livekit-report"
  | "pipecat-otlp"
  | "pipecat-events"
  | "elevenlabs-conversation"
  | "elevenlabs-otlp"
  | "otlp";

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const PIPECAT_EVENTS = new Set([
  "user_speech_started",
  "user_speech_stopped",
  "user_turn_started",
  "user_turn_stopped",
  "bot_speech_started",
  "bot_speech_stopped",
  "interruption",
  "recording_started",
  "function_call_started",
  "function_call_in_progress",
  "function_call_completed",
  "function_call_failed",
  "function_call_timed_out",
  "function_call_cancelled",
]);

/** The scopes and span names in an OTLP export. */
function otlpNames(v: Json): { scopes: Set<string>; spans: Set<string> } {
  const scopes = new Set<string>();
  const spans = new Set<string>();
  for (const r of Array.isArray(v.resourceSpans) ? v.resourceSpans : [])
    for (const s of isRecord(r) && Array.isArray(r.scopeSpans) ? r.scopeSpans : []) {
      if (isRecord(s) && isRecord(s.scope) && typeof s.scope.name === "string") scopes.add(s.scope.name);
      for (const span of isRecord(s) && Array.isArray(s.spans) ? s.spans : [])
        if (isRecord(span) && typeof span.name === "string") spans.add(span.name);
    }
  return { scopes, spans };
}

/** What a parsed file is, or undefined when it's none of the exports earshot reads. */
export function detectFormat(value: unknown): ExportKind | undefined {
  if (Array.isArray(value))
    return value.length > 0 && value.every((e) => isRecord(e) && PIPECAT_EVENTS.has(String(e.kind)))
      ? "pipecat-events"
      : undefined;
  if (!isRecord(value)) return undefined;
  if (value.version === 1 && isRecord(value.call) && isRecord(value.clock) && Array.isArray(value.turns))
    return "call-trace";
  if (Array.isArray(value.resourceSpans)) {
    const { scopes, spans } = otlpNames(value);
    if (scopes.has("livekit-agents") || spans.has("agent_session") || spans.has("user_turn"))
      return "livekit-otlp";
    if (
      scopes.has("pipecat") ||
      scopes.has("pipecat.turn") ||
      (spans.has("conversation") && spans.has("turn"))
    )
      return "pipecat-otlp";
    if ([...scopes].some((s) => s.startsWith("elevenlabs"))) return "elevenlabs-otlp";
    return "otlp";
  }
  const conversation = isRecord(value.data) ? value.data : value;
  if (typeof conversation.conversation_id === "string" && Array.isArray(conversation.transcript))
    return "elevenlabs-conversation";
  if (Array.isArray(value.events) && ("room" in value || "job_id" in value || "sdk_version" in value))
    return "livekit-report";
  return undefined;
}

/** Parses a file's text: JSON, or JSON Lines (one event per line, as Pipecat's observers log). */
export function parseExport(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split("\n").filter((l) => l.trim());
    return lines.map((l) => JSON.parse(l) as unknown);
  }
}

export interface ReadExports {
  trace: CallTrace;
  /** The stack it came from. */
  provider: string;
  /** What had to be assumed, or is missing, in plain words. */
  warnings: string[];
}

/** One call from the files a stack exported (parsed; any order), with its recording when there is
 * one, and the detectors run. Throws, saying why, when the files aren't one call. */
export function readExports(
  values: readonly unknown[],
  extra: { recording?: RecordingInput; call?: Partial<CallMeta> } = {},
): ReadExports {
  const found = values.map((v) => ({ value: v, kind: detectFormat(v) }));
  const of = (kind: ExportKind) => found.filter((f) => f.kind === kind).map((f) => f.value);
  const unknown = found.filter((f) => f.kind === undefined).length;
  const warnings: string[] = [];
  if (unknown)
    warnings.push(`${unknown} file${unknown === 1 ? " isn't" : "s aren't"} an export earshot reads`);
  if (of("elevenlabs-otlp").length)
    throw new Error(
      "ElevenLabs' OpenTelemetry export is no more exact than its conversation: use the conversation JSON",
    );
  if (of("otlp").length && !of("livekit-otlp").length && !of("pipecat-otlp").length)
    throw new Error("These spans aren't from LiveKit Agents or Pipecat");
  const trace = of("call-trace")[0] as CallTrace | undefined;
  if (trace) return { trace, provider: trace.call.provider ?? "earshot", warnings };

  const withAudio = extra.recording?.peaks !== undefined || extra.recording?.sources !== undefined;
  let provider: Source;
  let stack: string;
  if (of("livekit-otlp").length) {
    stack = "livekit";
    const report = of("livekit-report")[0] as LiveKitSessionReport | undefined;
    provider = livekit({ otlp: of("livekit-otlp") as OtlpTraces[], ...(report && { report }) });
    if (!report) warnings.push("No session report: consent, disclosure and agent states aren't known");
  } else if (of("pipecat-otlp").length) {
    stack = "pipecat";
    const events = (of("pipecat-events") as PipecatEvent[][]).flat();
    provider = pipecat({ otlp: of("pipecat-otlp") as OtlpTraces[], events });
    if (!events.length)
      warnings.push("No observer events: when each side spoke and how tool calls went are worked out");
    else if (withAudio && !events.some((e) => e.kind === "recording_started"))
      warnings.push("No recording_started event: the recording is assumed to start with the conversation");
  } else if (of("elevenlabs-conversation").length) {
    stack = "elevenlabs";
    provider = elevenLabsAgents(of("elevenlabs-conversation")[0] as ElevenLabsInput);
    if (withAudio) warnings.push("The recording is assumed to start with the call, both sides mixed");
  } else
    throw new Error(
      "No call in these files: expected LiveKit or Pipecat spans, or an ElevenLabs conversation",
    );
  if (!withAudio)
    warnings.push("No recording: the waveform lanes are empty, and turns are placed from the export");

  const channels =
    extra.recording?.channels ??
    (stack === "elevenlabs" ? (["mixed"] as const) : (["caller", "agent"] as const));
  const read = readCall(
    provider,
    recording({ ...extra.recording, channels }),
    ...(extra.call ? [callMeta(extra.call)] : []),
  );
  return { trace: { ...read, findings: runDetectors(read) }, provider: stack, warnings };
}
