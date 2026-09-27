/* What Pipecat would have recorded for a scripted call: its OpenTelemetry spans as OTLP/JSON
 * (`conversation` > `turn` > `stt`, `llm`, `tts`, with the attributes pipecat's tracing sets), and
 * the events its `SpeakingObserver` and `FunctionCallObserver` report, one JSON object per line,
 * with `recording_started` for when `AudioBufferProcessor` began. The debugger reads them with
 * the same `fromPipecat` a real call goes through.
 *
 * As in a real cascaded pipeline, a tool call has no span: the model's request that asks for it,
 * then its result in the next request's input. That next request is part of the reply's wait, so
 * it's carved out of the voice's time to first byte, and speech still starts where it's placed. */
import type { OtlpKeyValue, OtlpSpanJson, OtlpTraces, PipecatEvent } from "@danolekh/earshot/formats";

import type { SimInput } from "./livekit-sim.ts";
import { DEFAULT_EOU, type Placed, type Stage } from "./scenario.ts";

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

/** How late the final transcript comes after speech ends. */
const TRANSCRIBED = 0.2;
/** How long the turn span lingers after the bot stops (`turn_end_timeout_secs`). */
const TURN_TIMEOUT = 2.5;

type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: null;
      tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function simulatePipecat(input: SimInput): { otlp: OtlpTraces; events: PipecatEvent[] } {
  const { scenario, placed, t0, heard, spoken } = input;
  const t0Seconds = Number(t0 / 1000n) / 1e6;
  let next = 0;
  const id = () => (++next).toString(16).padStart(16, "0");
  const traceId = [...`pipecat:${scenario.id}`]
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11)
    .toString(16)
    .padStart(32, "0");
  const ns = (s: number) => (t0 + BigInt(Math.round(s * 1e6)) * 1000n).toString();
  const turnSpans: OtlpSpanJson[] = [];
  const serviceSpans: OtlpSpanJson[] = [];
  const span = (
    into: OtlpSpanJson[],
    name: string,
    start: number,
    end: number,
    parent: string | undefined,
    attrs: Record<string, Attr | undefined> = {},
  ): string => {
    const spanId = id();
    into.push({
      traceId,
      spanId,
      ...(parent && { parentSpanId: parent }),
      name,
      kind: 1,
      startTimeUnixNano: ns(start),
      endTimeUnixNano: ns(Math.max(start, end)),
      attributes: kv(attrs),
    });
    return spanId;
  };
  const events: PipecatEvent[] = [{ kind: "recording_started", timestamp: t0Seconds }];
  const event = (e: PipecatEvent) => events.push({ ...e, timestamp: t0Seconds + e.timestamp });
  const unix = (s: number) => t0Seconds + s;

  const byStart = [...placed].sort((a, b) => a.start - b.start);
  const agents = byStart.filter((p) => p.line.channel === "agent");
  const callers = byStart.filter((p) => p.line.channel === "caller");

  // An exchange starts with the call, then with each caller line; the bot's replies in it are the
  // agent lines that start before the next one.
  const starts = [0, ...callers.map((p) => p.start)];
  const conversation = span(turnSpans, "conversation", 0, input.duration, undefined, {
    "conversation.id": `conv_${scenario.id}`,
    "conversation.type": "voice",
  });
  const exchangeOf = new Map<Placed, string>();
  starts.forEach((start, i) => {
    const end = starts[i + 1] ?? input.duration;
    const caller = i > 0 ? callers[i - 1] : undefined;
    const replies = agents.filter((a) => a.start >= start && a.start < end);
    const last = replies.at(-1);
    const interrupted = last !== undefined && last.end > end - 0.001 && starts[i + 1] !== undefined;
    const duration = last ? last.end - start : undefined;
    const spanEnd = interrupted || !last ? end : Math.min(end, last.end + TURN_TIMEOUT);
    const turn = span(turnSpans, "turn", start, spanEnd, conversation, {
      "turn.number": i + 1,
      "turn.type": "conversation",
      "conversation.id": `conv_${scenario.id}`,
      ...(duration !== undefined && { "turn.duration_seconds": duration }),
      "turn.was_interrupted": interrupted,
      ...(caller && replies[0] && { "turn.user_bot_latency_seconds": replies[0].start - caller.end }),
    });
    if (caller) exchangeOf.set(caller, turn);
    for (const r of replies) exchangeOf.set(r, turn);
  });

  const context: Message[] = [{ role: "system", content: scenario.instructions }];
  const model = scenario.context.model ?? "gpt-4.1";
  const stt = (scenario.context.stt ?? "").match(/nova-\d/)?.[0] ?? "nova-3";
  const llm = (parent: string, start: number, ttfb: number, end: number, output?: string) =>
    span(serviceSpans, "llm", start, end, parent, {
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": model,
      "gen_ai.operation.name": "chat",
      "gen_ai.output.type": "text",
      stream: true,
      "metrics.ttfb": ttfb,
      input: JSON.stringify(context),
      ...(output !== undefined && { output }),
      "gen_ai.usage.input_tokens": 380 + 42 * context.length,
      "gen_ai.usage.output_tokens": output ? 38 : 24,
    });

  for (const p of byStart) {
    const line = p.line;
    const turn = exchangeOf.get(p)!;
    if (line.channel === "caller") {
      const got = heard[line.id]!;
      span(serviceSpans, "stt", p.start, p.end + TRANSCRIBED, turn, {
        "gen_ai.provider.name": "deepgram",
        "gen_ai.request.model": stt,
        "gen_ai.operation.name": "stt",
        transcript: got.text,
        is_final: true,
        language: scenario.language,
        "metrics.ttfb": TRANSCRIBED,
      });
      // Voice activity per chunk; the turn detector lets the turn go only after the last.
      for (const c of p.chunks) {
        event({ kind: "user_speech_started", timestamp: c.start });
        event({ kind: "user_speech_stopped", timestamp: c.end, started_at: unix(c.start) });
      }
      event({ kind: "user_turn_started", timestamp: p.start + 0.2 });
      event({
        kind: "user_turn_stopped",
        timestamp: p.end + (line.eou ?? DEFAULT_EOU).wait,
        started_at: unix(p.start + 0.2),
      });
      // The bot was still talking: it's interrupted once the caller is confirmed.
      const talking = agents.find((a) => a.start < p.start && a.end >= p.start - 0.001);
      if (talking) event({ kind: "interruption", timestamp: p.start + 0.2 });
      context.push({ role: "user", content: got.text });
      continue;
    }

    // The bot: its stages before speaking, as a reply, or a request just before (the greeting).
    const text = spoken[line.id] ?? line.text;
    const stages: readonly (Stage & { start: number })[] = p.reply?.stages ?? [
      { kind: "llm", seconds: 0.45, start: p.start - 1.0 },
      { kind: "tts", seconds: 0.35, start: p.start - 0.35 },
    ];
    let pending: { name: string; id: string } | undefined;
    stages.forEach((s, i) => {
      const after = stages[i + 1];
      if (s.kind === "llm") {
        const end = s.start + s.seconds + (after?.kind === "tool" ? 0.04 : 0.6);
        llm(turn, s.start, s.seconds, end, after?.kind === "tool" ? undefined : text);
      } else if (s.kind === "tool") {
        const callId = `call_${line.id}`;
        const args = JSON.stringify(s.tool.arguments);
        const result = s.tool.error ?? JSON.stringify(s.tool.result);
        event({
          kind: "function_call_started",
          function_name: s.tool.name,
          tool_call_id: callId,
          timestamp: s.start,
          arguments: s.tool.arguments,
        });
        event({
          kind: s.tool.error ? "function_call_failed" : "function_call_completed",
          function_name: s.tool.name,
          tool_call_id: callId,
          timestamp: s.start + s.seconds,
          started_at: unix(s.start),
          ...(s.tool.error ? { error: s.tool.error } : { result: s.tool.result }),
        });
        context.push({
          role: "assistant",
          content: null,
          tool_calls: [{ id: callId, type: "function", function: { name: s.tool.name, arguments: args } }],
        });
        context.push({ role: "tool", tool_call_id: callId, content: result });
        pending = { name: s.tool.name, id: callId };
      } else {
        // After a tool, the model runs again on its result: carved out of the voice's wait.
        let ttfb = s.seconds;
        let from = s.start;
        if (pending) {
          const again = Math.max(0.05, s.seconds * 0.6);
          llm(turn, s.start, again, s.start + again + 0.6, text);
          ttfb = Math.max(0.02, s.seconds - again);
          from = s.start + again;
          pending = undefined;
        }
        span(serviceSpans, "tts", from, Math.max(from + ttfb, p.fullEnd - 0.4), turn, {
          "gen_ai.provider.name": "cartesia",
          "gen_ai.request.model": "sonic-2",
          "gen_ai.operation.name": "tts",
          "gen_ai.output.type": "speech",
          voice_id: "de-female-1",
          text: line.text,
          "metrics.character_count": line.text.length,
          "metrics.ttfb": ttfb,
          ...(line.stopAfter !== undefined && { "tts.interrupted": true }),
        });
      }
    });
    event({ kind: "bot_speech_started", timestamp: p.start });
    event({ kind: "bot_speech_stopped", timestamp: p.end, started_at: unix(p.start) });
    context.push({ role: "assistant", content: text });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  const otlp: OtlpTraces = {
    resourceSpans: [
      {
        resource: { attributes: kv({ "service.name": "voice-agent", "telemetry.sdk.language": "python" }) },
        scopeSpans: [
          { scope: { name: "pipecat.turn" }, spans: turnSpans },
          { scope: { name: "pipecat" }, spans: serviceSpans },
        ],
      },
    ],
  };
  return { otlp, events };
}
