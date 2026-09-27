/* What LiveKit Agents would have emitted for a scripted call: its OpenTelemetry spans as OTLP/JSON
 * (`agent_session` > `user_turn` > `eou_wait` > `eou_detection`; `agent_turn` > `llm_node` >
 * `llm_request` > `llm_request_run`, `function_tool`, `tts_node` > `tts_request`, `agent_speaking`)
 * with the attributes livekit/agents 1.8 sets, and the session report. The debugger then reads
 * them with the same `fromLiveKit` a real call goes through. */
import type { LiveKitSessionReport, OtlpKeyValue, OtlpSpanJson, OtlpTraces } from "@danolekh/earshot/formats";

import { DEFAULT_EOU, type Placed, type Scenario } from "./scenario.ts";

type Attr = string | number | boolean;

const kv = (attrs: Record<string, Attr | undefined>): OtlpKeyValue[] =>
  Object.entries(attrs).flatMap(([key, v]) =>
    v === undefined
      ? []
      : [
          {
            key,
            value:
              typeof v === "string"
                ? { stringValue: v }
                : typeof v === "boolean"
                  ? { boolValue: v }
                  : Number.isInteger(v)
                    ? { intValue: String(v) }
                    : { doubleValue: Math.round(v * 1e6) / 1e6 },
          },
        ],
  );

export interface SimInput {
  scenario: Scenario;
  placed: readonly Placed[];
  /** Unix nanoseconds of the recording's first sample. */
  t0: bigint;
  /** Per caller line: the transcript the agent got, and its mean confidence. */
  heard: Readonly<Record<string, { text: string; confidence: number }>>;
  /** Per agent line: the text the caller heard before any cut. */
  spoken: Readonly<Record<string, string>>;
  duration: number;
}

export function simulateLiveKit(input: SimInput): { otlp: OtlpTraces; report: LiveKitSessionReport } {
  const { scenario, placed, t0, heard, spoken } = input;
  let next = 0;
  const id = () => (++next).toString(16).padStart(16, "0");
  const traceId = [...scenario.id]
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(32, "0");
  const ns = (s: number) => (t0 + BigInt(Math.round(s * 1e6)) * 1000n).toString();
  const spans: OtlpSpanJson[] = [];
  const span = (
    name: string,
    start: number,
    end: number,
    parent: string | undefined,
    attrs: Record<string, Attr | undefined> = {},
    error?: string,
  ): string => {
    const spanId = id();
    spans.push({
      traceId,
      spanId,
      ...(parent && { parentSpanId: parent }),
      name,
      kind: 1,
      startTimeUnixNano: ns(start),
      endTimeUnixNano: ns(Math.max(start, end)),
      attributes: kv(attrs),
      ...(error && { status: { code: 2, message: error } }),
    });
    return spanId;
  };

  const session = span("agent_session", 0, input.duration, undefined, {
    "lk.agent_name": scenario.versions.agent,
    "lk.pii.room_name": scenario.id,
  });
  const context: { role: string; content: string }[] = [{ role: "system", content: scenario.instructions }];
  const byStart = [...placed].sort((a, b) => a.start - b.start);

  for (const p of byStart) {
    const line = p.line;
    if (line.channel === "caller") {
      const eou = line.eou ?? DEFAULT_EOU;
      const got = heard[line.id]!;
      const turn = span("user_turn", p.start, p.end + eou.wait, session, {
        "lk.pii.user_transcript": got.text,
        "lk.transcript_confidence": got.confidence,
        "lk.transcription_delay": 0.18,
        "lk.end_of_turn_delay": eou.wait,
        "lk.stt.events": JSON.stringify(
          p.chunks.map((c) => ({
            received_at: Number(t0 / 1000n) / 1e6 + c.end + 0.18,
            type: "final_transcript",
          })),
        ),
      });
      // Every mid-turn pause: the detector looked, found the caller unlikely to be done, waited.
      for (let i = 0; i + 1 < p.chunks.length; i++) {
        const from = p.chunks[i]!.end;
        const to = p.chunks[i + 1]!.start;
        const wait = span("eou_wait", from, to, turn, {
          "lk.eou.outcome": "user_resumed",
          "lk.eou.wait_duration": to - from,
        });
        span("eou_detection", from + 0.02, from + 0.06, wait, {
          "lk.eou.probability": line.pauseProbability ?? 0.1,
          "lk.eou.unlikely_threshold": 0.15,
        });
      }
      const wait = span("eou_wait", p.end, p.end + eou.wait, turn, {
        "lk.eou.outcome": "committed",
        "lk.eou.wait_duration": eou.wait,
        "lk.eou.endpointing_delay": eou.wait,
      });
      span("eou_detection", p.end + 0.02, p.end + 0.07, wait, {
        "lk.eou.probability": eou.probability,
        "lk.eou.unlikely_threshold": 0.15,
      });
      context.push({ role: "user", content: got.text });
      continue;
    }

    // The agent: from the end of the wait it answers (or just before a greeting it was told to say).
    const reply = p.reply;
    const begins = reply ? reply.anchor + reply.wait : p.start - 0.35;
    const reported = reply ? reply.wait + reply.stages.reduce((n, s) => n + s.seconds, 0) : undefined;
    const turn = span("agent_turn", begins, p.end, session, {
      "lk.speech_id": `speech_${line.id}`,
      "lk.generation_id": `gen_${line.id}`,
      "lk.e2e_latency": reported,
      "lk.end_of_turn_delay": reply?.wait,
      "lk.interrupted": line.stopAfter !== undefined,
    });
    const stages = reply?.stages ?? [{ kind: "tts" as const, seconds: p.start - begins, start: begins }];
    stages.forEach((s, i) => {
      const after = stages[i + 1];
      if (s.kind === "llm") {
        // The model streams on after its first token: into the tool call, or alongside speech.
        const end = s.start + s.seconds + (after?.kind === "tool" ? 0.04 : 0.6);
        const node = span("llm_node", s.start, end, turn);
        const request = span("llm_request", s.start + 0.005, end, node, {
          "gen_ai.operation.name": "chat",
          "gen_ai.provider.name": "openai",
          "gen_ai.request.model": scenario.context.model,
          "gen_ai.usage.input_tokens": 380 + 42 * context.length,
          "gen_ai.usage.output_tokens": after?.kind === "tool" ? 24 : 38,
          "lk.response.ttft": s.seconds - 0.005,
          "lk.pii.chat_ctx": JSON.stringify(context),
          ...(after?.kind === "tool"
            ? {
                "lk.pii.response.function_calls": JSON.stringify([
                  { name: after.tool.name, arguments: after.tool.arguments },
                ]),
              }
            : { "lk.pii.response.text": line.text }),
        });
        span("llm_request_run", s.start + 0.006, end, request, { "lk.retry_count": 0 });
      } else if (s.kind === "tool") {
        span(
          "function_tool",
          s.start,
          s.start + s.seconds,
          turn,
          {
            "lk.function_tool.name": s.tool.name,
            "lk.function_tool.id": `call_${line.id}`,
            "lk.pii.function_tool.arguments": JSON.stringify(s.tool.arguments),
            "lk.pii.function_tool.output": s.tool.error ?? JSON.stringify(s.tool.result),
            "lk.function_tool.is_error": s.tool.error !== undefined,
          },
          s.tool.error,
        );
        context.push({
          role: "tool_call",
          content: JSON.stringify({ name: s.tool.name, arguments: s.tool.arguments }),
        });
        context.push({ role: "tool_result", content: s.tool.error ?? JSON.stringify(s.tool.result) });
      } else {
        const node = span("tts_node", s.start, p.end, turn);
        span("tts_request", s.start, p.end, node, {
          "lk.response.ttfb": s.seconds,
          "lk.pii.input_text": line.text,
          "lk.tts.streaming": true,
          "lk.tts.label": scenario.context.tts,
        });
      }
    });
    span("agent_speaking", p.start, p.end, turn, {
      "lk.speech_id": `speech_${line.id}`,
      "lk.interrupted": line.stopAfter !== undefined,
    });
    context.push({ role: "assistant", content: spoken[line.id] ?? line.text });
  }

  const t0Seconds = Number(t0 / 1000n) / 1e6;
  const greeting = placed.find((p) => p.line.channel === "agent");
  const consent = placed.find((p) => p.line.id === "consent");
  const otlp: OtlpTraces = {
    resourceSpans: [
      {
        resource: {
          attributes: kv({
            "service.name": "voice-agent",
            "telemetry.sdk.language": "python",
            "telemetry.sdk.version": "1.8.3",
          }),
        },
        scopeSpans: [{ scope: { name: "livekit-agents", version: "1.8.3" }, spans }],
      },
    ],
  };
  const report: LiveKitSessionReport = {
    room: scenario.id,
    job_id: `AJ_${traceId.slice(0, 12)}`,
    sdk_version: "1.8.3",
    audio_recording_started_at: t0Seconds,
    started_at: t0Seconds - 1.2,
    events: [
      ...(greeting
        ? [{ type: "disclosure", created_at: t0Seconds + greeting.start, text: "Ich bin eine KI." }]
        : []),
      ...(consent ? [{ type: "consent", created_at: t0Seconds + consent.end, granted: true }] : []),
    ],
  };
  return { otlp, report };
}
