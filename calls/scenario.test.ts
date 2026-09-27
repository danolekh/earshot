import { fromLiveKit } from "@danolekh/earshot/formats";
import { latencyBreakdown } from "@danolekh/earshot/trace";
import { describe, expect, it } from "vitest";

import { simulateLiveKit } from "./livekit-sim.ts";
import { estimateDurations, place } from "./scenario.ts";
import { callId, CALLS } from "./scenarios/index.ts";
import { stadtwerke } from "./scenarios/stadtwerke-zaehlerstand.ts";

const placed = place(stadtwerke, estimateDurations(stadtwerke));
const at = (id: string) => placed.find((p) => p.line.id === id)!;

describe("placing the demo call", () => {
  it("starts the agent 0.1 s after the caller resumes mid-number, and cuts it 0.45 s later (moment 1)", () => {
    expect(at("noted").start - at("dictate-2").start).toBeCloseTo(0.1);
    expect(at("noted").end - at("noted").start).toBeCloseTo(0.45);
    expect(at("noted").fullEnd).toBeGreaterThan(at("noted").end);
  });

  it("keeps the caller waiting 3.1 s for the save, with 'Hallo?' 2.3 s in (moment 3)", () => {
    expect(at("saved").start - at("reading").end).toBeCloseTo(3.1);
    expect(at("hello").start - at("reading").end).toBeCloseTo(2.3);
    expect(at("saved").reply!.stages.map((s) => s.kind)).toEqual(["llm", "tool", "tts"]);
  });

  it("refuses a line that refers to one not placed yet", () => {
    const broken = { ...stadtwerke, lines: [stadtwerke.lines[2]!] };
    expect(() => place(broken, estimateDurations(broken))).toThrow(/consent/);
  });
});

describe("what LiveKit would have traced", () => {
  const t0 = 1_790_414_042_000_000_000n;
  const heard = Object.fromEntries(
    stadtwerke.lines
      .filter((l) => l.channel === "caller")
      .map((l) => [l.id, { text: l.text, confidence: 0.93 }]),
  );
  const { otlp, report } = simulateLiveKit({
    scenario: stadtwerke,
    placed,
    t0,
    heard,
    spoken: {},
    duration: 60,
  });
  const trace = fromLiveKit({ otlp, report });

  it("reads back as one turn per line, in order", () => {
    const order = [...placed].sort((a, b) => a.start - b.start);
    expect(trace.turns.map((t) => t.channel)).toEqual(order.map((p) => p.line.channel));
    expect(trace.turns[0]!.start).toBeCloseTo(order[0]!.start);
  });

  it("explains the slow save: 2.64 s reported, 3.1 s measured, 0.46 s unaccounted for", () => {
    const saved = trace.turns.find((t) => t.text.startsWith("Vielen Dank"))!;
    const b = latencyBreakdown(trace, saved.id)!;
    expect(b.reported).toBeCloseTo(2.64);
    expect(b.measured).toBeCloseTo(3.1, 1);
    expect(b.unexplained).toBeCloseTo(0.46, 1);
    expect(b.stages.map((s) => s.label)).toEqual([
      "End of turn",
      "gpt-4.1",
      "crm.submit_meter_reading",
      "TTS",
    ]);
  });

  it("records the consent, the disclosure and every end-of-turn decision", () => {
    expect(trace.signals.filter((s) => s.type === "consent" || s.type === "disclosure")).toHaveLength(2);
    const resumed = trace.signals.filter(
      (s) => s.type === "eou_decision" && s.data.outcome === "user_resumed",
    );
    expect(resumed).toHaveLength(5);
  });
});

describe("every demo call", () => {
  it.each(CALLS.map((c) => [callId(c), c] as const))(
    "%s places, and its expectations name its lines",
    (_, c) => {
      const lines = c.scenario.lines.map((l) => l.id);
      expect(new Set(lines).size).toBe(lines.length);
      expect(() => place(c.scenario, estimateDurations(c.scenario))).not.toThrow();
      for (const f of c.expected) expect(lines).toContain(f.line);
      expect(Number.isNaN(Date.parse(c.scenario.startedAt))).toBe(false);
    },
  );

  it("have ids unique across the set, and a script is only reused on another stack", () => {
    const ids = CALLS.map(callId);
    expect(new Set(ids).size).toBe(ids.length);
    const scripts = CALLS.map((c) => `${c.scenario.id}:${c.stack ?? "livekit"}`);
    expect(new Set(scripts).size).toBe(scripts.length);
  });
});
