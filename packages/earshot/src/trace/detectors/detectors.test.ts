import { describe, expect, it } from "vitest";

import { traceBuilder } from "../../test/trace-fixtures";
import { similarity } from "../similarity";
import type { FindingType } from "../types";
import { runDetectors } from "./index";

const only = (trace: Parameters<typeof runDetectors>[0], type: FindingType) =>
  runDetectors(trace, { only: [type] });

describe("slow_turn", () => {
  it("measures from the end of the speech the agent answers, not a later 'Hallo?'", () => {
    const trace = traceBuilder()
      .caller("c1", 0, 1, "Zwölf dreiundvierzig")
      .caller("c2", 2.2, 2.5, "Hallo?")
      .agent("a1", 2.6, 3.5, "Gespeichert.", { replyTo: "c1" })
      .build();
    const [f] = only(trace, "slow_turn");
    expect(f).toMatchObject({
      id: "slow_turn:a1",
      start: 1,
      end: 2.6,
      severity: "warning",
      measured: { gap: 1.6 },
    });
  });

  it("lets a quick reply go", () => {
    const trace = traceBuilder()
      .caller("c1", 0, 1, "Hallo")
      .agent("a1", 2.4, 3, "Hallo!", { replyTo: "c1" })
      .build();
    expect(only(trace, "slow_turn")).toEqual([]);
  });
});

describe("dead_air", () => {
  it("flags silence in the middle of a call", () => {
    const trace = traceBuilder().caller("c1", 0, 1, "Hallo").agent("a1", 3.1, 4, "Hallo!").build();
    expect(only(trace, "dead_air")[0]).toMatchObject({ start: 1, end: 3.1, measured: { silence: 2.1 } });
  });

  it("ignores short pauses and the silence before the first word", () => {
    const trace = traceBuilder().caller("c1", 3, 4, "Hallo").agent("a1", 5.9, 6.5, "Hallo!").build();
    expect(only(trace, "dead_air")).toEqual([]);
  });
});

describe("talk_over", () => {
  it("flags overlap longer than a backchannel, and only that", () => {
    const at = (agentStart: number) =>
      only(
        traceBuilder().caller("c1", 0, 2, "Ich wollte sagen").agent("a1", agentStart, 3, "Danke").build(),
        "talk_over",
      );
    expect(at(1.69)).toHaveLength(1);
    expect(at(1.71)).toEqual([]);
  });
});

describe("agent_did_not_stop", () => {
  it("flags the agent talking on over the caller", () => {
    const trace = traceBuilder()
      .agent("a1", 0, 3, "Ein langer Satz")
      .caller("c1", 1, 2.5, "Moment bitte")
      .build();
    expect(only(trace, "agent_did_not_stop")[0]).toMatchObject({ turnId: "a1", measured: { overlap: 1.5 } });
  });

  it("lets an agent that stopped go", () => {
    const trace = traceBuilder()
      .agent("a1", 0, 3, "Ein langer Satz", { interrupted: { at: 1.4 } })
      .caller("c1", 1, 2.5, "Moment bitte")
      .build();
    expect(only(trace, "agent_did_not_stop")).toEqual([]);
  });
});

describe("false_interruption", () => {
  it("flags reported false interruptions and stops for a backchannel", () => {
    const trace = traceBuilder()
      .agent("a1", 0, 3, "Ihr Termin ist am Montag", { interrupted: { at: 1.5 } })
      .caller("c1", 1, 1.3, "mhm")
      .signal({ type: "interruption", at: 1, turnId: "a1", data: { decision: "stop" } })
      .signal({ type: "false_interruption", at: 5 })
      .build();
    expect(only(trace, "false_interruption").map((f) => f.start)).toEqual([1, 5]);
  });

  it("lets a real interruption go", () => {
    const trace = traceBuilder()
      .agent("a1", 0, 3, "Ihr Termin ist am Montag", { interrupted: { at: 1.5 } })
      .caller("c1", 1, 2, "Moment, warten Sie")
      .signal({ type: "interruption", at: 1, turnId: "a1", data: { decision: "stop" } })
      .build();
    expect(only(trace, "false_interruption")).toEqual([]);
  });
});

describe("early_endpoint", () => {
  const dictation = (outcome: "committed" | "user_resumed", replyEnd = 2.1) =>
    traceBuilder()
      .caller("c1", 0, 1, "vier sieben eins")
      .caller("c2", 1.6, 2.4, "null acht drei")
      .agent("a1", 1.7, replyEnd, "Danke, ich habe", { replyTo: "c1" })
      .signal({
        type: "eou_decision",
        at: 1.31,
        turnId: "c1",
        data: { probability: 0.62, wait: 0.31, outcome },
      })
      .build();

  it("flags a committed end of turn the caller talked on through, as an error mid-number", () => {
    expect(only(dictation("committed"), "early_endpoint")[0]).toMatchObject({
      id: "early_endpoint:c1",
      severity: "error",
      measured: { pause: 0.6, probability: 0.62 },
    });
  });

  it("lets the detector's correct waits, and speech after the reply, go", () => {
    expect(only(dictation("user_resumed"), "early_endpoint")).toEqual([]);
    expect(only(dictation("committed", 1.5), "early_endpoint")).toEqual([]);
  });
});

describe("low_asr_confidence", () => {
  const heard = (confidence: number) =>
    traceBuilder()
      .caller("c1", 0, 1, "vier sieben acht")
      .words("c1", "streaming_asr", "vier sieben acht", 0, 1, [{}, {}, { confidence }])
      .build();

  it("flags unsure words, one finding per turn", () => {
    expect(only(heard(0.41), "low_asr_confidence")[0]).toMatchObject({ measured: { confidence: 0.41 } });
    expect(only(heard(0.7), "low_asr_confidence")).toEqual([]);
  });

  it("falls back to the turn's confidence", () => {
    const trace = traceBuilder().caller("c1", 0, 1, "Hallo", { confidence: 0.5 }).build();
    expect(only(trace, "low_asr_confidence")).toHaveLength(1);
  });
});

describe("heard_vs_said", () => {
  it("flags a number the agent didn't hear", () => {
    const trace = traceBuilder()
      .caller("c1", 0, 3, "vier sieben eins null acht drei")
      .words("c1", "streaming_asr", "vier sieben eins acht drei", 0, 3)
      .words("c1", "aligned", "vier sieben eins null acht drei", 0, 3)
      .build();
    const [f] = only(trace, "heard_vs_said");
    expect(f!.message).toContain('"null" was said but not heard');
    expect(f!.severity).toBe("error");
  });

  it("ignores slips outside numbers and slots", () => {
    const trace = traceBuilder()
      .caller("c1", 0, 1, "Hallo zusammen")
      .words("c1", "streaming_asr", "Hallu zusammen", 0, 1)
      .words("c1", "aligned", "Hallo zusammen", 0, 1)
      .build();
    expect(only(trace, "heard_vs_said")).toEqual([]);
  });
});

describe("tools", () => {
  const tool = (duration: number, error?: string) =>
    traceBuilder()
      .span({
        name: "function_tool",
        kind: "tool",
        start: 1,
        end: 1 + duration,
        attributes: {},
        tool: { name: "crm.lookup_customer" },
        ...(error && { status: { code: "error", message: error } }),
      })
      .build();

  it("flags failures", () => {
    expect(only(tool(0.2, "404"), "tool_error")[0]!.message).toBe("crm.lookup_customer failed: 404");
    expect(only(tool(0.2), "tool_error")).toEqual([]);
  });

  it("flags slow calls", () => {
    expect(only(tool(1.9), "slow_tool")[0]).toMatchObject({
      severity: "warning",
      measured: { duration: 1.9 },
    });
    expect(only(tool(0.9), "slow_tool")).toEqual([]);
  });
});

describe("repeat", () => {
  it("scores a question asked again as alike", () => {
    expect(
      similarity(
        "Können Sie mir bitte Ihre Kundennummer nennen?",
        "Können Sie mir bitte Ihre Kundennummer noch einmal nennen?",
      ),
    ).toBeGreaterThan(0.8);
  });

  it("flags the agent asking the same thing again, not short courtesies", () => {
    const trace = traceBuilder()
      .agent("a1", 0, 3, "Danke. Können Sie mir bitte Ihre Kundennummer nennen?")
      .agent(
        "a2",
        10,
        14,
        "Danke. Leider nichts gefunden. Können Sie mir bitte Ihre Kundennummer noch einmal nennen?",
      )
      .agent("a3", 20, 22, "Danke. Wie ist Ihr Zählerstand?")
      .build();
    expect(only(trace, "repeat").map((f) => f.turnId)).toEqual(["a2"]);
  });
});

describe("disclosure_missing", () => {
  it("wants the AI named early, in the call's language", () => {
    const opening = (text: string) =>
      only(traceBuilder().agent("a1", 0, 3, text).build(), "disclosure_missing");
    expect(opening("Guten Tag, hier ist die digitale Assistentin der Stadtwerke Muster.")).toEqual([]);
    expect(opening("Guten Tag, ich bin eine KI der Stadtwerke Muster.")).toEqual([]);
    expect(opening("Guten Tag, hier sind die Stadtwerke Muster.")).toHaveLength(1);
  });
});

describe("runDetectors", () => {
  it("takes threshold overrides and keeps people's findings", () => {
    const base = traceBuilder()
      .caller("c1", 0, 1, "Hallo")
      .agent("a1", 2.4, 3, "Hallo!", { replyTo: "c1" })
      .build();
    const trace = {
      ...base,
      findings: [
        {
          id: "human_feedback:1",
          type: "human_feedback" as const,
          start: 2,
          end: 3,
          severity: "info" as const,
          detector: { id: "ops", version: 1 },
          message: "Sounded rude",
          evidence: [],
        },
      ],
    };
    const found = runDetectors(trace, { config: { slowTurn: { gap: 1 } }, only: ["slow_turn"] });
    expect(found.map((f) => f.type)).toEqual(["slow_turn", "human_feedback"]);
  });
});
