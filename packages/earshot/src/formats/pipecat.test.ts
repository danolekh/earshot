import { describe, expect, it } from "vitest";

import { otlpSpan, T0_MS } from "../test/trace-fixtures";
import { blindSpots, runDetectors } from "../trace/detectors";
import { latencyBreakdown } from "../trace/latency";
import type { OtlpTraces } from "./otlp";
import { fromPipecat, type PipecatEvent } from "./pipecat";

const T0 = T0_MS / 1000;
const system = { role: "system", content: "Du bist die Assistentin der Stadtwerke." };
const greeting = { role: "assistant", content: "Guten Tag, hier sind die Stadtwerke." };
const asked = { role: "user", content: "Meine Nummer ist vier sieben eins" };
const call = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_1",
      type: "function",
      function: { name: "crm.lookup_customer", arguments: '{"customer_id":"471"}' },
    },
  ],
};
const result = { role: "tool", tool_call_id: "call_1", content: '{"error":"not found"}' };

/** A Pipecat call as its tracing records it: a greeting, then the caller's number, a model request
 * that only calls a tool, and one that answers. */
const otlp: OtlpTraces = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: "stadtwerke-bot" } }] },
      scopeSpans: [
        {
          scope: { name: "pipecat.turn" },
          spans: [
            otlpSpan("c", "conversation", 0, 14, {
              attrs: { "conversation.id": "conv-1", "conversation.type": "voice" },
            }),
            otlpSpan("x1", "turn", 0, 5.5, {
              parent: "c",
              attrs: { "turn.number": 1, "turn.duration_seconds": 3.0, "turn.was_interrupted": false },
            }),
            otlpSpan("x2", "turn", 4, 14, {
              parent: "c",
              attrs: {
                "turn.number": 2,
                "turn.duration_seconds": 7.5,
                "turn.was_interrupted": false,
                "turn.user_bot_latency_seconds": 2.9,
              },
            }),
          ],
        },
        {
          scope: { name: "pipecat" },
          spans: [
            otlpSpan("l0", "llm", 0.1, 0.9, {
              parent: "x1",
              attrs: {
                "gen_ai.request.model": "gpt-4.1",
                "metrics.ttfb": 0.4,
                input: JSON.stringify([system]),
                output: greeting.content,
              },
            }),
            otlpSpan("s0", "tts", 0.5, 2.5, {
              parent: "x1",
              attrs: { text: greeting.content, "metrics.ttfb": 0.2 },
            }),
            otlpSpan("u1", "stt", 4, 6.2, {
              parent: "x2",
              attrs: {
                transcript: asked.content,
                is_final: true,
                "metrics.ttfb": 0.3,
                "gen_ai.request.model": "nova-3",
              },
            }),
            otlpSpan("l1", "llm", 6.3, 6.9, {
              parent: "x2",
              attrs: {
                "gen_ai.request.model": "gpt-4.1",
                "metrics.ttfb": 0.35,
                input: JSON.stringify([system, greeting, asked]),
              },
            }),
            otlpSpan("l2", "llm", 8.1, 8.9, {
              parent: "x2",
              attrs: {
                "gen_ai.request.model": "gpt-4.1",
                "metrics.ttfb": 0.3,
                input: JSON.stringify([system, greeting, asked, call, result]),
                output: "Leider finde ich keinen Vertrag.",
              },
            }),
            otlpSpan("s2", "tts", 8.5, 10, {
              parent: "x2",
              attrs: { text: "Leider finde ich keinen Vertrag.", "metrics.ttfb": 0.25 },
            }),
          ],
        },
      ],
    },
  ],
};

const events: PipecatEvent[] = [
  { kind: "recording_started", timestamp: T0 },
  { kind: "bot_speech_started", timestamp: T0 + 0.75 },
  { kind: "bot_speech_stopped", timestamp: T0 + 2.9 },
  { kind: "user_speech_started", timestamp: T0 + 4 },
  { kind: "user_speech_stopped", timestamp: T0 + 5.6, started_at: T0 + 4 },
  { kind: "user_turn_stopped", timestamp: T0 + 6, started_at: T0 + 4 },
  {
    kind: "function_call_started",
    function_name: "crm.lookup_customer",
    tool_call_id: "call_1",
    timestamp: T0 + 7,
    arguments: { customer_id: "471" },
  },
  {
    kind: "function_call_failed",
    function_name: "crm.lookup_customer",
    tool_call_id: "call_1",
    timestamp: T0 + 7.9,
    started_at: T0 + 7,
    error: "404: not found",
  },
  { kind: "bot_speech_started", timestamp: T0 + 8.8 },
  { kind: "bot_speech_stopped", timestamp: T0 + 11.3 },
];

describe("a Pipecat call from its traces alone", () => {
  const trace = fromPipecat({ otlp, call: { title: "Zählerstand" } });

  it("finds the turns: the caller's from transcripts, the agent's from what was spoken", () => {
    expect(trace.call).toMatchObject({ id: "conv-1", provider: "pipecat", title: "Zählerstand" });
    expect(trace.turns.map((t) => [t.channel, t.start, t.end, t.text, t.estimated ?? false])).toEqual([
      ["agent", 0.7, 3, "Guten Tag, hier sind die Stadtwerke.", true],
      ["caller", 4, 6.2, "Meine Nummer ist vier sieben eins", true],
      ["agent", 8.75, 11.5, "Leider finde ich keinen Vertrag.", true],
    ]);
    expect(trace.turns[2]).toMatchObject({
      replyTo: "t1",
      latency: { e2e: 2.9, llmTtft: 0.3, ttsTtfb: 0.25 },
    });
  });

  it("works out the tool call from the next request's input, and says it can't judge it", () => {
    const tool = trace.spans.find((s) => s.kind === "tool")!;
    expect(tool).toMatchObject({
      name: "crm.lookup_customer",
      start: 6.9,
      end: 8.1,
      turnId: "t2",
      estimated: true,
      tool: { callId: "call_1", arguments: { customer_id: "471" }, result: { error: "not found" } },
    });
    expect(blindSpots(trace).tool_error).toBe("tool results aren't recorded");
    expect(blindSpots(trace).early_endpoint).toBe("no end-of-turn decisions");
    const judged = fromPipecat({
      otlp,
      isToolError: (r) => typeof r === "object" && r !== null && "error" in r,
    });
    expect(runDetectors(judged).map((f) => f.type)).toContain("tool_error");
  });

  it("normalizes the model's input and first-token times", () => {
    const answer = trace.spans.find((s) => s.id === "l2".padStart(16, "0"))!;
    expect(answer.firstChunk).toBeCloseTo(8.4);
    expect(answer.llm?.messages?.at(-2)).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call_1", name: "crm.lookup_customer", arguments: { customer_id: "471" } }],
    });
    expect(answer.llm?.messages?.at(-1)).toMatchObject({ role: "tool", toolCallId: "call_1" });
  });
});

describe("a Pipecat call with its observers' events", () => {
  const trace = fromPipecat({ otlp, events });

  it("times speech and tool calls as they happened", () => {
    expect(trace.clock.t0UnixMs).toBe(T0_MS);
    expect(trace.turns.map((t) => [t.start, t.end, t.estimated ?? false])).toEqual([
      [0.75, 2.9, false],
      [4, 5.6, false],
      [8.8, 11.3, false],
    ]);
    const tools = trace.spans.filter((s) => s.kind === "tool");
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      start: 7,
      end: 7.9,
      status: { code: "error", message: "404: not found" },
    });
    expect(tools[0]!.estimated).toBeUndefined();
  });

  it("records the turn detector letting go, as a decision and a wait", () => {
    expect(trace.signals.find((s) => s.type === "eou_decision")).toMatchObject({
      at: 6,
      turnId: "t1",
      data: { outcome: "committed", wait: 0.4 },
    });
    const b = latencyBreakdown(trace, "t2")!;
    expect(b.stages.map((s) => s.kind)).toEqual(["endpointing", "llm", "tool", "llm", "tts"]);
    expect(runDetectors(trace).map((f) => f.type)).toContain("tool_error");
    expect(blindSpots(trace).early_endpoint).toBeUndefined();
  });
});
