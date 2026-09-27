import Ajv2020 from "ajv/dist/2020";
import schema from "@danolekh/earshot/schema/call-trace.v1.json";
import { type CallTrace, runDetectors } from "@danolekh/earshot/trace";
import { describe, expect, it } from "vitest";

import { summarizeCall } from "@/lib/triage";

import { demo } from "./demo";
import summaries from "./index.json";

const traces = Object.values(
  import.meta.glob<CallTrace>("./*.trace.json", { eager: true, import: "default" }),
);
const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);

describe.each(traces.map((t) => [t.call.id, t] as const))("the demo call %s", (_, trace) => {
  it("is a valid call trace", () => {
    validate(JSON.parse(JSON.stringify(trace)));
    expect(validate.errors ?? []).toEqual([]);
  });

  it("still gets exactly its stored findings from today's detectors", () => {
    const fresh = runDetectors(trace).map((f) => [f.id, f.type, f.severity, f.start]);
    expect(fresh).toEqual(trace.findings.map((f) => [f.id, f.type, f.severity, f.start]));
  });

  it("is summed up in the list as it is now", () => {
    expect(summaries.find((s) => s.id === trace.call.id)).toEqual(summarizeCall(trace));
  });
});

describe("the demo calls", () => {
  it("are all in the list", () => {
    expect(summaries.map((s) => s.id).sort()).toEqual(traces.map((t) => t.call.id).sort());
  });

  it("include the meter-reading call's three planted moments", () => {
    const types = demo.findings.map((f) => f.type).sort();
    expect(types).toEqual(
      [
        "early_endpoint",
        "talk_over",
        "heard_vs_said",
        "low_asr_confidence",
        "tool_error",
        "repeat",
        "dead_air",
        "slow_turn",
        "slow_tool",
        "talk_over",
      ].sort(),
    );
  });
});
