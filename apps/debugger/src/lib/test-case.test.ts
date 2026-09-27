import schema from "@danolekh/earshot/schema/call-test.v1.json";
import {
  type CallTrace,
  type Check,
  checkFor,
  describeCheck as checkText,
  draftTestCase,
  runChecks,
  runTestCase,
} from "@danolekh/earshot/trace";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const traces = Object.values(
  import.meta.glob<CallTrace>("../calls/*.trace.json", { eager: true, import: "default" }),
);
const byId = (id: string) => traces.find((t) => t.call.id === id)!;
const demo = byId("stadtwerke-zaehlerstand");
const clean = byId("paket-rueckruf");

describe("drafting a test case", () => {
  it.each(
    traces.flatMap((t) =>
      t.findings.filter((f) => f.turnId).map((f) => [`${t.call.id} ${f.id}`, t, f] as const),
    ),
  )("from %s: its checks fail on the call it came from", (_, trace, f) => {
    const draft = draftTestCase(trace, f.turnId!, f.id);
    const picked = checkFor(trace, f);
    expect(draft.checks[0]).toEqual(picked);
    expect(runChecks(trace, [picked])[0]!.pass).toBe(false);
  });

  it("covers the exchange and says what the agent ran on", () => {
    const f = demo.findings.find((x) => x.type === "tool_error")!;
    const draft = draftTestCase(demo, f.turnId!, f.id);
    expect(draft.source.callId).toBe("stadtwerke-zaehlerstand");
    expect(draft.source.turns.length).toBe(2);
    expect(draft.context).toMatchObject({ promptVersion: "zaehlerstand@7", model: "gpt-4.1" });
    expect(draft.context.messages).toBeGreaterThan(0);
    expect(draft.name).toBe("Stadtwerke Muster · Zählerstand · Tool failed at 0:25");
    expect(draft.checks[0]).toMatchObject({
      kind: "tool_succeeds",
      tool: "crm.lookup_customer",
      turn: f.turnId,
    });
    // Found on other calls by what the caller said before the reply.
    // The first of the two times the caller read the number (the second, read back, heard right).
    expect(draft.checks[0]!.at).toEqual({ said: "Vier sieben eins null acht drei.", reply: true, nth: 0 });
  });

  it("asks to hear what was said, and a reply in time", () => {
    const misheard = demo.findings.find((x) => x.type === "heard_vs_said")!;
    const hears = draftTestCase(demo, misheard.turnId!, misheard.id).checks[0]!;
    expect(hears).toMatchObject({ kind: "hears" });
    expect(runChecks(demo, [hears])[0]!.measured).toContain("“null”");
    const slow = demo.findings.find((x) => x.type === "slow_turn")!;
    const reply = draftTestCase(demo, slow.turnId!, slow.id).checks[0]!;
    expect(reply).toMatchObject({
      kind: "reply_within",
      seconds: 1.5,
      turn: slow.turnId,
      at: { reply: true },
    });
    expect(runChecks(demo, [reply])[0]!.measured).toMatch(/^waited 3\.\d\d s$/);
  });
});

describe("findings about the whole call", () => {
  it("are checked across the whole call, not on a turn", () => {
    const deadAir = demo.findings.find((x) => x.type === "dead_air")!;
    expect(checkFor(demo, deadAir)).toEqual({ kind: "no_finding", finding: "dead_air" });
  });
});

describe("checks on the clean call", () => {
  it("pass, call-wide, for every kind of finding planted elsewhere", () => {
    const types = [...new Set(traces.flatMap((t) => t.findings.map((f) => f.type)))];
    const checks: Check[] = [
      ...types.map((finding): Check => ({ kind: "no_finding", finding })),
      { kind: "reply_within", seconds: 1.5 },
      { kind: "tool_succeeds", tool: "delivery.reschedule" },
    ];
    for (const r of runChecks(clean, checks))
      expect(r.pass, `${checkText(r.check)}: ${r.measured}`).toBe(true);
  });

  it("drafts a reply-in-time check from a turn with no findings, and it passes", () => {
    const reply = clean.turns.find((t) => t.channel === "agent" && t.replyTo)!;
    const draft = draftTestCase(clean, reply.id);
    expect(draft.checks).toMatchObject([{ kind: "reply_within", seconds: 1.5, turn: reply.id }]);
    expect(runChecks(clean, draft.checks)[0]!.pass).toBe(true);
  });
});

describe("a check as a sentence", () => {
  it("says what the agent should do", () => {
    expect(checkText({ kind: "no_finding", finding: "early_endpoint" })).toBe(
      "Waits for the caller to finish before replying",
    );
    expect(checkText({ kind: "reply_within", seconds: 1.5 })).toBe("Replies within 1.5 s");
    expect(checkText({ kind: "tool_succeeds", tool: "crm.lookup_customer" })).toBe(
      "crm.lookup_customer succeeds",
    );
  });
});

describe("a test from the bad call, on the fixed call", () => {
  const fixed = byId("stadtwerke-zaehlerstand-v43");

  it.each(demo.findings.filter((f) => f.turnId).map((f) => [f.id, f] as const))(
    "from %s: fails on v42, never fails on v43",
    (_, f) => {
      const draft = draftTestCase(demo, f.turnId!, f.id);
      expect(runTestCase(demo, draft).some((r) => r.status === "fail")).toBe(true);
      const failed = runTestCase(fixed, draft).filter((r) => r.status === "fail");
      expect(failed.map((r) => `${checkText(r.check)}: ${r.measured}`)).toEqual([]);
    },
  );

  it("finds the same moments on v43: the whole number is one turn now", () => {
    const f = demo.findings.find((x) => x.type === "tool_error")!;
    const draft = draftTestCase(demo, f.turnId!, f.id);
    expect(runTestCase(demo, draft).map((r) => r.status)).toEqual(["fail", "fail", "fail", "fail"]);
    const onFixed = runTestCase(fixed, draft);
    expect(onFixed.map((r) => r.status)).toEqual(["pass", "pass", "pass", "pass"]);
    const dictation = fixed.turns.find((t) => t.channel === "caller" && t.text.includes("null"))!;
    expect(onFixed[1]!.turn).toBe(dictation.id);
  });
});

describe("the test case file", () => {
  it("matches its schema, for every draft", () => {
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    for (const trace of traces)
      for (const f of trace.findings.filter((x) => x.turnId)) {
        validate(JSON.parse(JSON.stringify(draftTestCase(trace, f.turnId!, f.id))));
        expect(validate.errors ?? []).toEqual([]);
      }
  });
});
