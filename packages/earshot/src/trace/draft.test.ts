import { describe, expect, it } from "vitest";

import { traceBuilder } from "../test/trace-fixtures";
import { runChecks } from "./checks";
import { detect } from "./detectors";
import { checkFor, describeCheck, draftTestCase, summarizeRun } from "./draft";
import { countBySeverity, groupFindings, worstSeverity } from "./findings";

// A slow reply to a number, then a long silence.
const trace = detect(
  traceBuilder({ id: "c", title: "Zählerstand" })
    .caller("t0", 0, 2, "Vier sieben eins")
    .words("t0", "aligned", "Vier sieben eins", 0, 2)
    .agent("t1", 4.5, 6, "Danke, ich schaue nach", { replyTo: "t0" })
    .caller("t2", 10, 11, "Hallo?")
    .build(),
);

describe("drafting a test case", () => {
  it("asks the slow reply for one within the detector's limit, anchored on what was said", () => {
    const slow = trace.findings.find((f) => f.type === "slow_turn")!;
    const test = draftTestCase(trace, slow.turnId!, slow.id);
    expect(test.name).toBe("Zählerstand · Slow reply at 0:01");
    expect(test.source).toMatchObject({ callId: "c", turns: ["t0", "t1"] });
    expect(test.checks[0]).toEqual({
      kind: "reply_within",
      seconds: 1.5,
      turn: "t1",
      at: { said: "Vier sieben eins", reply: true, nth: 0 },
    });
    expect(runChecks(trace, test.checks)[0]!.status).toBe("fail");
  });

  it("checks a finding about the whole call across the call", () => {
    const air = trace.findings.find((f) => f.type === "dead_air")!;
    expect(checkFor(trace, air)).toEqual({ kind: "no_finding", finding: "dead_air" });
    expect(describeCheck(checkFor(trace, air))).toBe("Doesn't leave the line silent for over 2 s");
  });
});

describe("what findings and runs come to", () => {
  it("counts, groups and ranks severities", () => {
    const fs = [
      { type: "dead_air" as const, severity: "warning" as const },
      { type: "dead_air" as const, severity: "error" as const },
      { type: "repeat" as const, severity: "warning" as const },
    ];
    expect(worstSeverity(fs)).toBe("error");
    expect(worstSeverity([])).toBe("info");
    expect(countBySeverity(fs)).toEqual({ error: 1, warning: 2, info: 0 });
    expect(groupFindings(fs).map((g) => [g.type, g.count, g.severity])).toEqual([
      ["dead_air", 2, "error"],
      ["repeat", 1, "warning"],
    ]);
  });

  it("says a run failed, couldn't check everything, or passed", () => {
    const r = (status: "pass" | "fail" | "missing") => ({
      check: { kind: "reply_within" as const, seconds: 1 },
      status,
      pass: status === "pass",
      measured: "",
    });
    expect(summarizeRun([r("fail"), r("pass")]).text).toBe("1 of 2 fail");
    expect(summarizeRun([r("pass"), r("missing")])).toEqual({
      status: "missing",
      text: "1 of 2 pass, 1 can't check",
    });
    expect(summarizeRun([r("pass"), r("pass")]).text).toBe("All pass");
  });
});
