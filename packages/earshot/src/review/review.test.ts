import { describe, expect, it } from "vitest";

import { traceBuilder } from "../test/trace-fixtures";
import { detect } from "../trace/detectors";
import { momentFor, parseMoment } from "./moment";
import { facets, filterCalls, filterValues, firstFinding, sortCalls } from "./query";
import { type CallSummary, summarizeCall } from "./summary";

const call = (id: string, over: Partial<CallSummary> = {}): CallSummary => ({
  id,
  title: id,
  duration: 30,
  findings: [],
  errors: 0,
  warnings: 0,
  turns: 4,
  text: "",
  ...over,
});
const f = (type: CallSummary["findings"][number]["type"], severity: "error" | "warning", start: number) => ({
  id: `${type}:${start}`,
  type,
  severity,
  start,
  message: type,
});

const calls = [
  call("a", {
    provider: "livekit",
    startedAt: "2026-09-24T10:00:00Z",
    findings: [f("dead_air", "warning", 3), f("tool_error", "error", 9)],
    errors: 1,
    warnings: 1,
    text: "Özdemir",
  }),
  call("b", {
    provider: "pipecat",
    startedAt: "2026-09-24T10:00:00Z",
    findings: [f("dead_air", "warning", 5)],
    warnings: 1,
  }),
  call("c", { provider: "elevenlabs", startedAt: "2026-09-25T10:00:00Z" }),
];

describe("summing a call up", () => {
  it("keeps its findings, how bad it was, and the stack that recorded it", () => {
    const trace = detect(
      traceBuilder({ id: "x", provider: "pipecat", title: "Zählerstand", versions: { prompt: "p@1" } })
        .caller("t0", 0, 1, "Hallo")
        .agent("t1", 4, 5, "Guten Tag", { replyTo: "t0" })
        .build(),
    );
    const s = summarizeCall(trace);
    expect(s).toMatchObject({ id: "x", title: "Zählerstand", provider: "pipecat", prompt: "p@1", turns: 2 });
    expect(s.slowestReply).toBe(3);
    expect(s.errors + s.warnings).toBe(s.findings.length);
  });
});

describe("finding calls", () => {
  it("searches words without case or accents, and filters by any of a filter's values", () => {
    expect(filterCalls(calls, { text: "ozdemir" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterCalls(calls, { filters: { provider: ["pipecat", "elevenlabs"] } }).map((c) => c.id)).toEqual(
      ["b", "c"],
    );
    expect(filterCalls(calls, { filters: { severity: ["clean"], provider: [] } }).map((c) => c.id)).toEqual([
      "c",
    ]);
  });

  it("counts each option under the other filters, not its own", () => {
    const counts = facets(calls, { filters: { type: ["tool_error"] } });
    expect(counts.type.get("dead_air")).toBe(2);
    expect(counts.provider.get("livekit")).toBe(1);
    expect(counts.provider.get("pipecat")).toBeUndefined();
    expect(filterValues(calls, "provider")).toEqual(["elevenlabs", "livekit", "pipecat"]);
  });

  it("opens a call at its first finding of the filtered types, an error when only errors show", () => {
    expect(firstFinding(calls[0]!)?.type).toBe("dead_air");
    expect(firstFinding(calls[0]!, { errorsOnly: true })?.type).toBe("tool_error");
    expect(firstFinding(calls[0]!, { types: ["tool_error"] })?.start).toBe(9);
  });

  it("sorts worst first, ties to the most recent, then by id", () => {
    expect(sortCalls(calls).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(sortCalls(calls, { column: "provider", desc: false }).map((c) => c.id)).toEqual(["c", "a", "b"]);
    const twins = [
      call("z", { startedAt: "2026-09-24T10:00:00Z" }),
      call("y", { startedAt: "2026-09-24T10:00:00Z" }),
    ];
    expect(sortCalls(twins).map((c) => c.id)).toEqual(["y", "z"]);
  });
});

describe("a moment in a call", () => {
  it("opens a little before what it points at", () => {
    expect(momentFor({ start: 25.43, finding: "tool_error:t9" })).toEqual({
      finding: "tool_error:t9",
      t: 25.13,
    });
    expect(momentFor({ start: 0.1, turn: "t0" })).toEqual({ turn: "t0", t: 0 });
  });

  it("drops what doesn't parse", () => {
    expect(parseMoment({ t: "12.345", from: "9", to: "3", turn: "t1", finding: "<script>" })).toEqual({
      t: 12.35,
      turn: "t1",
    });
  });
});
