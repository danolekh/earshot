import { describe, expect, it } from "vitest";

import { traceBuilder } from "../test/trace-fixtures";
import { runChecks } from "./checks";
import { blindSpots } from "./detectors";
import { latencyBreakdown } from "./latency";

describe("what a stack didn't record", () => {
  const bare = traceBuilder()
    .caller("t0", 0, 2, "Vier sieben eins")
    .agent("t1", 3.4, 5, "Danke", {
      replyTo: "t0",
      latency: { transcription: 0.2, llmTtft: 0.7, ttsTtfb: 0.3 },
      context: { model: "gpt-4.1" },
    })
    .speech("caller", [{ start: 0, end: 2 }])
    .build();

  it("is named, per detector, so a check on it can't pass by default", () => {
    const spots = blindSpots(bare);
    expect(spots.early_endpoint).toBe("no end-of-turn decisions");
    expect(spots.heard_vs_said).toBe("no transcript of what was said");
    expect(spots.low_asr_confidence).toBe("no confidence from the recogniser");
    expect(spots.slow_turn).toBeUndefined();
    const [r] = runChecks(bare, [{ kind: "no_finding", finding: "early_endpoint", turn: "t0" }]);
    expect(r).toMatchObject({ status: "missing", pass: false, measured: "no end-of-turn decisions" });
  });

  it("includes who talked over whom, on a mono recording", () => {
    const mono = { ...bare, speech: { mixed: [{ start: 0, end: 5 }] } };
    expect(blindSpots(mono).talk_over).toMatch(/mono/);
    expect(blindSpots(bare).talk_over).toBeUndefined();
  });

  it("includes how a tool call went, when the call was only worked out", () => {
    const worked = traceBuilder()
      .agent("t0", 0, 1, "Moment")
      .span({
        name: "crm.lookup",
        kind: "tool",
        start: 0.2,
        end: 0.8,
        turnId: "t0",
        attributes: {},
        estimated: true,
        tool: { name: "crm.lookup" },
      })
      .build();
    expect(blindSpots(worked).tool_error).toBe("tool results aren't recorded");
    expect(runChecks(worked, [{ kind: "tool_succeeds", tool: "crm.lookup" }])[0]!.status).toBe("missing");
  });
});

describe("a reply's wait, from reported figures", () => {
  it("lays the stages end to end from the caller's last word when there are no spans", () => {
    const b = latencyBreakdown(
      traceBuilder()
        .caller("t0", 0, 2, "Vier sieben eins")
        .agent("t1", 3.4, 5, "Danke", {
          replyTo: "t0",
          latency: { transcription: 0.2, llmTtft: 0.7, ttsTtfb: 0.3 },
          context: { model: "gpt-4.1" },
        })
        .speech("caller", [{ start: 0, end: 2 }])
        .build(),
      "t1",
    )!;
    expect(
      b.stages.map((s) => [s.kind, s.label, +s.start.toFixed(2), +s.end.toFixed(2), s.reported]),
    ).toEqual([
      ["stt", "Transcription", 2, 2.2, true],
      ["llm", "gpt-4.1", 2.2, 2.9, true],
      ["tts", "TTS", 2.9, 3.2, true],
    ]);
    expect(b.unexplained).toBeCloseTo(0.2);
  });
});
