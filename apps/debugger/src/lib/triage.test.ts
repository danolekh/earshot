import { describe, expect, it } from "vitest";

import { demo } from "@/calls/demo";

import {
  type CallSummary,
  callLink,
  facets,
  filterCalls,
  filterValues,
  firstMatch,
  orderedCalls,
  parseTriageSearch,
  sortCalls,
  summarizeCall,
} from "./triage";

const stadtwerke = summarizeCall(demo);

/** A call made up for the filters: its findings by type and severity, and when it started. */
const call = (
  id: string,
  startedAt: string,
  findings: [CallSummary["findings"][number]["type"], "error" | "warning"][],
  extra: Partial<CallSummary> = {},
): CallSummary => ({
  id,
  title: id,
  startedAt,
  duration: 30,
  findings: findings.map(([type, severity], i) => ({
    id: `${type}:${i}`,
    type,
    severity,
    start: i * 5,
    message: "",
  })),
  errors: findings.filter(([, s]) => s === "error").length,
  warnings: findings.filter(([, s]) => s === "warning").length,
  turns: 8,
  text: "",
  ...extra,
});

const calls = [
  call(
    "solar",
    "2026-09-25T14:32:10Z",
    [
      ["disclosure_missing", "error"],
      ["slow_tool", "error"],
      ["dead_air", "warning"],
    ],
    { direction: "outbound", prompt: "solar@3", achieved: true },
  ),
  call(
    "praxis",
    "2026-09-25T08:03:41Z",
    [
      ["false_interruption", "warning"],
      ["agent_did_not_stop", "error"],
    ],
    { direction: "inbound", prompt: "praxis@12", achieved: false },
  ),
  call(
    "tarif",
    "2026-09-22T11:20:33Z",
    [
      ["slow_turn", "error"],
      ["dead_air", "warning"],
    ],
    { slowestReply: 3.2 },
  ),
  call("paket", "2026-09-26T07:58:12Z", [], { text: "Die Zustellung ist für morgen geplant" }),
];

describe("a call's summary", () => {
  it("counts the demo call's findings and its slowest reply", () => {
    expect(stadtwerke).toMatchObject({
      id: "stadtwerke-zaehlerstand",
      title: "Stadtwerke Muster · Zählerstand",
      direction: "outbound",
      prompt: "zaehlerstand@7",
      errors: 4,
      warnings: 6,
    });
    expect(stadtwerke.slowestReply).toBeCloseTo(3.13, 1);
    expect(stadtwerke.findings.map((f) => f.start)).toEqual(
      [...stadtwerke.findings.map((f) => f.start)].sort((a, b) => a - b),
    );
    expect(stadtwerke.text).toContain("Zählerstand");
  });
});

describe("filtering the list", () => {
  it("keeps calls with any of the picked finding types", () => {
    expect(filterCalls(calls, { type: "dead_air,false_interruption" }).map((c) => c.id)).toEqual([
      "solar",
      "praxis",
      "tarif",
    ]);
  });

  it("filters by a call's worst finding, outcome, direction and prompt", () => {
    expect(filterCalls(calls, { severity: "error" }).map((c) => c.id)).toEqual(["solar", "praxis", "tarif"]);
    expect(filterCalls(calls, { severity: "clean" }).map((c) => c.id)).toEqual(["paket"]);
    expect(filterCalls(calls, { outcome: "not-done" }).map((c) => c.id)).toEqual(["praxis"]);
    expect(filterCalls(calls, { direction: "inbound,outbound" }).map((c) => c.id)).toEqual([
      "solar",
      "praxis",
    ]);
    expect(filterCalls(calls, { prompt: "solar@3", severity: "error" }).map((c) => c.id)).toEqual(["solar"]);
  });

  it("searches words, titles and findings, without accents or case", () => {
    expect(filterCalls(calls, { q: "zustellung MORGEN" }).map((c) => c.id)).toEqual(["paket"]);
    expect(filterCalls([stadtwerke], { q: "zahlerstand" })).toHaveLength(1);
    expect(filterCalls([stadtwerke], { q: "tool failed" })).toHaveLength(1);
  });

  it("counts each filter's options under every other filter, but not its own", () => {
    const all = facets(calls, {});
    expect(all.type.get("dead_air")).toBe(2);
    expect(all.severity.get("error")).toBe(3);
    // Picking a type doesn't shrink its own options...
    const picked = facets(calls, { type: "slow_tool" });
    expect(picked.type.get("dead_air")).toBe(2);
    // ...but does narrow the others.
    expect(picked.severity.get("error")).toBe(1);
    expect(picked.severity.get("clean")).toBeUndefined();
  });

  it("lists every option in a fixed order, whatever is picked", () => {
    expect(filterValues(calls, "severity")).toEqual(["error", "warning", "clean"]);
    expect(filterValues(calls, "type")).toEqual(filterValues(filterCalls(calls, {}), "type"));
    expect(filterValues(calls, "prompt")).toEqual(["praxis@12", "solar@3"]);
  });

  it("sorts worst first, or by any column either way", () => {
    // praxis and tarif tie on one error and one warning: the more recent comes first.
    expect(sortCalls(calls).map((c) => c.id)).toEqual(["solar", "praxis", "tarif", "paket"]);
    expect(sortCalls(calls, { column: "started", desc: true })[0]!.id).toBe("paket");
    expect(sortCalls(calls, { column: "started", desc: false })[0]!.id).toBe("tarif");
    expect(sortCalls(calls, { column: "slowest", desc: true })[0]!.id).toBe("tarif");
    expect(orderedCalls(calls, { sort: "call.asc", severity: "error" }).map((c) => c.id)).toEqual([
      "praxis",
      "solar",
      "tarif",
    ]);
  });

  it("opens a call at the first finding the filters point to", () => {
    const solar = calls[0]!;
    expect(firstMatch(solar, {})?.type).toBe("disclosure_missing");
    expect(firstMatch(solar, { type: "dead_air" })?.type).toBe("dead_air");
    expect(callLink(solar, firstMatch(solar, { type: "dead_air" }))).toEqual({
      id: "solar",
      search: { finding: "dead_air:2", t: 9.7 },
    });
    expect(callLink(calls[3]!, firstMatch(calls[3]!, {}))).toEqual({ id: "paket", search: {} });
  });
});

describe("the list's URL", () => {
  it("keeps valid filters and drops the rest", () => {
    expect(
      parseTriageSearch({
        type: "dead_air,<x>,dead_air",
        severity: "error,bad",
        q: "  Özdemir ",
        sort: "slowest.desc",
        page: "2",
      }),
    ).toEqual({ type: "dead_air", severity: "error", q: "Özdemir", sort: "slowest.desc", page: 2 });
    expect(parseTriageSearch({ sort: "findings.desc", q: "   ", page: "1", perPage: "25" })).toEqual({});
  });

  it("still reads links from before the table", () => {
    expect(parseTriageSearch({ errors: "1", sort: "recent" })).toEqual({
      severity: "error",
      sort: "started.desc",
    });
  });
});
