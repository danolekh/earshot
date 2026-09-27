import { describe, expect, it } from "vitest";

import { runChecks } from "../trace/checks";
import { blindSpots, runDetectors } from "../trace/detectors";
import { latencyBreakdown } from "../trace/latency";
import { type ElevenLabsConversation, fromElevenLabsAgents } from "./elevenlabs-agents";
import { elevenLabsAgents } from "./elevenlabs-agents";
import { readCall } from "./read";
import { timedWords } from "./sources";

const conversation: ElevenLabsConversation = {
  conversation_id: "conv_01",
  agent_name: "stadtwerke-outbound",
  version_id: "v42",
  metadata: {
    start_time_unix_secs: 1_790_414_042,
    call_duration_secs: 30,
    main_language: "de",
    phone_call: { direction: "outbound" },
  },
  analysis: { call_successful: "success", call_summary_title: "Zählerstand erfasst" },
  transcript: [
    { role: "agent", message: "Guten Tag, hier sind die Stadtwerke.", time_in_call_secs: -1 },
    { role: "user", message: "Ja, hallo.", time_in_call_secs: 3 },
    {
      role: "agent",
      message: "",
      time_in_call_secs: 5,
      tool_calls: [
        { request_id: "r1", tool_name: "crm.lookup_customer", params_as_json: '{"customer_id":"471"}' },
      ],
      tool_results: [
        {
          request_id: "r1",
          tool_name: "crm.lookup_customer",
          result_value: "404: not found",
          is_error: true,
          tool_latency_secs: 1.9,
        },
      ],
      conversation_turn_metrics: { metrics: { convai_llm_service_ttfb: { elapsed_time: 0.6 } } },
    },
    {
      role: "agent",
      message: "Leider finde ich keinen Vertrag.",
      time_in_call_secs: 8,
      feedback: { score: "dislike", time_in_call_secs: 9 },
      conversation_turn_metrics: { convai_tts_service_ttfb: { elapsed_time: 0.2 } },
    },
    { role: "user", message: "Mhm.", time_in_call_secs: 11, ignored_as_backchannel: true },
    { role: "user", message: "4", time_in_call_secs: 13, source_medium: "dtmf" },
  ],
};

describe("an ElevenLabs Agents conversation", () => {
  const trace = fromElevenLabsAgents({
    conversation: { type: "post_call_transcription", data: conversation },
  });

  it("becomes turns from its messages, each start to the second, the first one's -1 as 0", () => {
    expect(trace.call).toMatchObject({
      id: "conv_01",
      provider: "elevenlabs",
      duration: 30,
      direction: "outbound",
      versions: { agent: "stadtwerke-outbound", version: "v42" },
      outcome: { achieved: true, goal: "Zählerstand erfasst" },
    });
    expect(trace.clock.channels).toEqual(["mixed"]);
    expect(trace.turns.map((t) => [t.channel, t.start, t.text, t.estimated])).toEqual([
      ["agent", 0, "Guten Tag, hier sind die Stadtwerke.", true],
      ["caller", 3, "Ja, hallo.", true],
      ["agent", 8, "Leider finde ich keinen Vertrag.", true],
      ["caller", 11, "Mhm.", true],
    ]);
    // No end in the transcript: as long as the words take, or until the next message.
    expect(trace.turns[0]!.end).toBeCloseTo(0 + 36 * 0.065);
  });

  it("times each tool call by its latency, gives the reply the model's and voice's figures", () => {
    const tool = trace.spans.find((s) => s.kind === "tool")!;
    expect(tool).toMatchObject({
      start: 5,
      end: 6.9,
      turnId: "t2",
      status: { code: "error" },
      estimated: true,
    });
    expect(tool.tool).toMatchObject({ callId: "r1", arguments: { customer_id: "471" }, isError: true });
    expect(trace.turns[2]!.latency).toEqual({ llmTtft: 0.6, ttsTtfb: 0.2, tool: expect.closeTo(1.9) });
    const found = runDetectors(trace).map((f) => f.type);
    expect(found).toEqual(expect.arrayContaining(["tool_error", "slow_tool", "human_feedback"]));
    expect(blindSpots(trace).tool_error).toBeUndefined();
  });

  it("keeps a person's dislike, a backchannel and keypad digits", () => {
    expect(trace.findings.find((f) => f.type === "human_feedback")).toMatchObject({
      start: 9,
      severity: "warning",
      turnId: "t2",
    });
    expect(trace.signals.map((s) => [s.type, s.at])).toEqual(
      expect.arrayContaining([
        ["backchannel", 11],
        ["dtmf", 13],
      ]),
    );
  });

  it("can't check what a mono transcript doesn't hold, rather than passing it", () => {
    const spots = blindSpots(trace);
    expect(Object.keys(spots).sort()).toEqual(["early_endpoint", "heard_vs_said", "low_asr_confidence"]);
    const [r] = runChecks(trace, [{ kind: "no_finding", finding: "early_endpoint" }]);
    expect(r!.status).toBe("missing");
  });

  it("moves the turns onto a reference transcript's words, and waits from the reported figures", () => {
    const words = timedWords([
      { text: "Ja,", channel: "caller", source: "aligned", start: 3.42, end: 3.7 },
      { text: "hallo.", channel: "caller", source: "aligned", start: 3.75, end: 4.1 },
      { text: "Leider", channel: "agent", source: "tts", start: 8.6, end: 8.95 },
      { text: "Vertrag.", channel: "agent", source: "tts", start: 9.8, end: 10.4 },
    ]);
    const placed = readCall(elevenLabsAgents(conversation), words);
    expect(placed.turns[1]).toMatchObject({ start: 3.42, end: 4.1 });
    expect(placed.turns[1]!.estimated).toBeUndefined();
    expect(placed.turns[2]).toMatchObject({ start: 8.6, end: 10.4 });
    const b = latencyBreakdown(placed, "t2")!;
    // The tool call's place is only known to the second, so it goes in the chain by its length.
    expect(b.stages.map((s) => [s.kind, s.reported ?? false])).toEqual([
      ["llm", true],
      ["tool", true],
      ["tts", true],
    ]);
  });
});
