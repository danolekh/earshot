import { describe, expect, it } from "vitest";

import { traceBuilder } from "../test/trace-fixtures";
import { detect } from "./detectors";
import { heardDiff, missedSaid } from "./diff";
import { turnEvidence } from "./evidence";
import { decisionsGist, heardGist, latencyGist, toolsGist } from "./gists";
import { latencyBreakdown, latencyRows } from "./latency";
import { describeSignal } from "./signals";
import { decisionsOf, toolsOf } from "./trace";

// The caller reads a number and "null" is lost; the agent's lookup fails and it answers slowly.
const trace = detect(
  traceBuilder({ id: "c" })
    .caller("t0", 0, 2, "vier sieben eins acht")
    .words("t0", "aligned", "vier sieben eins null acht", 0, 2)
    .words("t0", "streaming_asr", "vier sieben eins acht", 0, 2, [{}, {}, {}, { confidence: 0.4 }])
    .agent("t1", 4, 5, "Leider nicht gefunden", { replyTo: "t0" })
    .span({
      name: "crm.lookup",
      kind: "tool",
      start: 2.5,
      end: 3.2,
      turnId: "t1",
      attributes: {},
      status: { code: "error", message: "404" },
      tool: { name: "crm.lookup" },
    })
    .signal({
      type: "eou_decision",
      at: 2.35,
      channel: "caller",
      turnId: "t0",
      data: { outcome: "committed", wait: 0.35, probability: 0.91 },
    })
    .speech("caller", [{ start: 0, end: 2 }])
    .build(),
);

describe("what explains a turn", () => {
  it("heard against said: what was missed, and which of the words said", () => {
    const d = heardDiff(trace, "t0")!;
    expect(d.ops.filter((o) => o.op !== "same").map((o) => o.said?.text)).toEqual(["null"]);
    expect([...missedSaid(d)]).toEqual([3]);
    expect(heardGist(d)).toBe("1 word missed · 1 unsure");
    expect(heardDiff(trace, "t1")).toBeUndefined();
  });

  it("the turn detector's decisions and the tools, in a line each", () => {
    const decisions = decisionsOf(trace, "t0");
    expect(decisionsGist(decisions)).toBe("committed after 350 ms · p 0.91");
    expect(describeSignal(decisions[0]!)).toBe("End of turn committed after 350 ms, p = 0.91");
    expect(toolsGist(toolsOf(trace, "t1"))).toBe("crm.lookup · 700 ms · failed");
  });

  it("a reply's wait, with the unexplained time as its last row", () => {
    const b = latencyBreakdown(trace, "t1")!;
    const rows = latencyRows(b);
    expect(rows.at(-1)).toMatchObject({ kind: "unexplained", end: 4 });
    expect(latencyGist(b)).toMatch(/^Waited 2\.00 s · \d+ ms unexplained$/);
  });

  it("in order per side, opening the piece that explains the picked finding", () => {
    // Its first finding is the slow reply; the failed tool's is picked.
    expect(turnEvidence(trace, "t1")).toEqual({
      parts: [{ kind: "latency" }, { kind: "tools" }],
      open: "latency",
    });
    const failed = trace.findings.find((f) => f.type === "tool_error")!;
    expect(turnEvidence(trace, "t1", failed.id).open).toBe("tools");
    expect(turnEvidence(trace, "t0")).toEqual({
      parts: [{ kind: "heard" }, { kind: "decisions" }],
      open: "heard",
    });
  });

  it("says what the stack didn't record, rather than leaving it out", () => {
    const bare = detect(traceBuilder({ id: "b" }).caller("t0", 0, 1, "Hallo").build());
    expect(turnEvidence(bare, "t0").parts).toEqual([
      { kind: "heard", missing: "no transcript of what was said" },
      { kind: "decisions", missing: "no end-of-turn decisions" },
    ]);
  });
});
