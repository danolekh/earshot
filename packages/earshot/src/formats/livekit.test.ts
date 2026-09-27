import { describe, expect, it } from "vitest";

import { T0_MS, livekitTwoTurns, otlpExport, otlpSpan } from "../test/trace-fixtures";
import { mergeAnalysis } from "../trace/analysis";
import { latencyBreakdown } from "../trace/latency";
import { toConversation } from "../trace/trace";
import { fromLiveKit } from "./livekit";
import { readOtlpSpans } from "./otlp";

describe("OTLP/JSON", () => {
  it("keeps nanoseconds exact past 2^53 and reads every value type", () => {
    const [span] = readOtlpSpans(
      otlpExport([otlpSpan("1", "x", 1.000001, 2, { attrs: { s: "a", i: 7, d: 0.5, b: true } })]),
    );
    expect(span!.start).toBe(1_790_414_043_250_501_000n);
    expect(span!.attributes).toEqual({ s: "a", i: 7, d: 0.5, b: true });
    expect(span!.resource["service.name"]).toBe("voice-agent");
  });
});

describe("fromLiveKit", () => {
  const trace = fromLiveKit({ otlp: livekitTwoTurns, recording: { startedAtUnixMs: T0_MS } });

  it("places turns on the recording's clock: caller speech until the end-of-turn wait, agent where it played", () => {
    expect(trace.turns.map((t) => [t.id, t.channel, t.start, t.end])).toEqual([
      ["t0", "caller", 1, 2.4],
      ["t1", "agent", 3.6, 4.8],
      ["t2", "caller", 4.3, 5.2],
    ]);
    expect(trace.clock.t0UnixMs).toBe(T0_MS);
  });

  it("joins the agent turn to what it answers, its latency and its interruption", () => {
    const agent = trace.turns[1]!;
    expect(agent).toMatchObject({
      replyTo: "t0",
      speechId: "speech_a1",
      interrupted: { at: 4.8 },
      text: "Ich finde die Bestellung leider nicht.",
    });
    expect(agent.latency).toMatchObject({ e2e: 1.2, llmTtft: 0.29, ttsTtfb: 0.12 });
    expect(agent.latency!.tool).toBeCloseTo(0.3);
    expect(trace.turns[0]!.confidence).toBe(0.93);
  });

  it("reads tools under either attribute spelling, failures as errors", () => {
    const tool = trace.spans.find((s) => s.kind === "tool")!;
    expect(tool.tool).toEqual({
      name: "lookup_order",
      callId: "call_1",
      arguments: { id: "A1" },
      result: "404 not found",
      isError: true,
    });
    expect(tool.status).toEqual({ code: "error", message: "404 not found" });
    expect(tool.turnId).toBe("t1");
    expect(trace.spans.find((s) => s.name === "eou_detection")!.turnId).toBe("t0");
  });

  it("turns end-of-turn waits and interruptions into signals", () => {
    const eou = trace.signals.filter((s) => s.type === "eou_decision");
    expect(eou[0]).toMatchObject({
      at: 2.75,
      turnId: "t0",
      data: { probability: 0.91, wait: 0.35, outcome: "committed" },
    });
    expect(trace.signals.find((s) => s.type === "interruption")).toMatchObject({
      at: 4.3,
      turnId: "t1",
      data: { decision: "stop", stopAfter: 0.5 },
    });
  });

  it("estimates words it has no timings for, and marks the agent's unheard ones", () => {
    const agentWords = trace.words.filter((w) => w.turnId === "t1");
    expect(agentWords.every((w) => w.estimated && w.source === "tts")).toBe(true);
    expect(agentWords.some((w) => w.heard === false)).toBe(true);
    expect(trace.call.versions?.sdk).toBe("livekit-agents 1.8.3");
  });

  it("falls back to the session report's recording start, then the session span", () => {
    const fromReport = fromLiveKit({
      otlp: livekitTwoTurns,
      report: { audio_recording_started_at: (T0_MS + 1000) / 1000 },
    });
    expect(fromReport.turns[0]!.start).toBeCloseTo(0);
    const fromSession = fromLiveKit({ otlp: livekitTwoTurns });
    expect(fromSession.turns[0]!.start).toBe(1);
  });

  it("splits the reply's wait into stages, the rest unexplained", () => {
    const withSpeech = mergeAnalysis(trace, {
      speech: {
        caller: [
          { start: 1, end: 2.4 },
          { start: 4.3, end: 5.2 },
        ],
      },
    });
    const b = latencyBreakdown(withSpeech, "t1")!;
    expect(b.anchor).toBe(2.4);
    expect(b.measured).toBeCloseTo(1.2);
    expect(b.stages.map((s) => [s.kind, s.label])).toEqual([
      ["endpointing", "End of turn"],
      ["llm", "gpt-4.1"],
      ["tool", "lookup_order"],
      ["tts", "TTS"],
    ]);
    // 0.35 wait + LLM to first token (2.75 to 3.05) + tool (3.05 to 3.35) + TTS first byte 0.12.
    expect(b.accounted).toBeCloseTo(0.35 + 0.3 + 0.3 + 0.12);
    expect(b.unexplained).toBeCloseTo(0.13);
    expect(b.reported).toBe(1.2);
  });

  it("projects onto a plain conversation the other parts read", () => {
    const c = toConversation(trace);
    expect(c.turns.map((t) => t.role)).toEqual(["user", "agent", "user"]);
    expect(c.turns[1]!.interruptedAt).toBe(4.8);
    expect(c.events.find((e) => e.type === "tool_call")).toMatchObject({
      name: "lookup_order",
      status: "error",
    });
    expect(c.events.find((e) => e.type === "latency")).toMatchObject({ kind: "e2e", end: 3.6, turnId: "t1" });
    expect(toConversation(trace)).toBe(c);
  });
});
