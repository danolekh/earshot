import { type CallTrace, type CheckResult, draftTestCase, summarizeRun } from "@danolekh/earshot/trace";
import { describe, expect, it } from "vitest";

import { CALL_LIST } from "./calls";
import { flowOf, momentOf, versionOf } from "./test-runs";

const traces = Object.values(
  import.meta.glob<CallTrace>("../calls/*.trace.json", { eager: true, import: "default" }),
);
const demo = traces.find((t) => t.call.id === "stadtwerke-zaehlerstand")!;

const result = (status: CheckResult["status"]): CheckResult => ({
  check: { kind: "reply_within", seconds: 1.5 },
  status,
  pass: status === "pass",
  measured: "",
});

describe("where a test runs", () => {
  it("on every call of its flow, oldest first, whichever stack recorded it", () => {
    const f = demo.findings.find((x) => x.type === "tool_error")!;
    const flow = flowOf(CALL_LIST, draftTestCase(demo, f.turnId!, f.id));
    expect(flow.map((c) => c.id)).toEqual([
      "stadtwerke-zaehlerstand",
      "stadtwerke-zaehlerstand-pipecat",
      "stadtwerke-zaehlerstand-elevenlabs",
      "stadtwerke-zaehlerstand-v43",
    ]);
    expect(flow.map(versionOf)).toEqual(["v42", "v42", "v42", "v43"]);
    expect(flow.map((c) => c.provider)).toEqual(["livekit", "pipecat", "elevenlabs", "livekit"]);
  });

  it("nowhere, when its call is gone", () => {
    const f = demo.findings[0]!;
    const test = draftTestCase(demo, f.turnId!, f.id);
    expect(flowOf(CALL_LIST, { ...test, source: { ...test.source, callId: "nope" } })).toEqual([]);
  });
});

describe("a run's summary", () => {
  it("fails on any failure, is incomplete on anything it can't check, else passes", () => {
    expect(summarizeRun(["fail", "fail", "pass", "missing"].map((s) => result(s as never)))).toEqual({
      status: "fail",
      text: "2 of 4 fail",
    });
    expect(summarizeRun([result("pass"), result("missing")])).toEqual({
      status: "missing",
      text: "1 of 2 pass, 1 can't check",
    });
    expect(summarizeRun([result("pass"), result("pass")])).toEqual({ status: "pass", text: "All pass" });
    expect(summarizeRun([result("pass")]).text).toBe("Passes");
  });
});

describe("a result's moment", () => {
  it("opens just before the turn it looked at, or at the start", () => {
    const turn = demo.turns[3]!;
    expect(momentOf(demo, turn.id)).toEqual({
      turn: turn.id,
      t: Math.max(0, Math.round((turn.start - 0.3) * 100) / 100),
    });
    expect(momentOf(demo, undefined)).toEqual({});
  });
});
