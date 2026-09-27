import { describe, expect, it } from "vitest";

import { fromLiveKit } from "../formats/livekit";
import { T0_MS, livekitTwoTurns } from "../test/trace-fixtures";
import { clusterByPixels, layoutSpans, packRows } from "./layout";

describe("layout", () => {
  it("packs overlapping items into as few rows as they need", () => {
    expect(
      packRows([
        { start: 0, end: 2 },
        { start: 1, end: 3 },
        { start: 2.5, end: 4 },
        { start: 3.5, end: 5 },
      ]),
    ).toEqual([0, 1, 0, 1]);
  });

  const trace = fromLiveKit({ otlp: livekitTwoTurns, recording: { startedAtUnixMs: T0_MS } });

  it("puts each stage on its own row, the outermost span only, marked where its first token came", () => {
    const placed = layoutSpans(trace.spans);
    expect(placed.map((p) => [p.span.name, p.row])).toEqual([
      ["eou_wait", 0],
      ["llm_node", 2],
      ["function_tool", 3],
      ["tts_node", 4],
      ["agent_speaking", 5],
      ["eou_wait", 0],
    ]);
    const llm = placed.find((p) => p.span.name === "llm_node")!;
    // llm_request starts 10 ms in and its first token comes 0.29 s later, in a 0.65 s span.
    expect(llm.mark).toBeCloseTo(0.3 / 0.65);
  });

  it("nests every span a row per level in depth mode", () => {
    const placed = layoutSpans(trace.spans, "depth");
    const row = (name: string) => placed.find((p) => p.span.name === name)!.row;
    expect(row("llm_request")).toBeGreaterThan(row("llm_node"));
  });

  it("merges markers that would crowd, and splits them when zoomed in", () => {
    const items = [{ start: 10 }, { start: 10.2 }, { start: 30 }];
    expect(clusterByPixels(items, { from: 0, to: 60 }, 600).map((c) => c.items.length)).toEqual([2, 1]);
    expect(clusterByPixels(items, { from: 9, to: 12 }, 600).map((c) => c.items.length)).toEqual([1, 1]);
  });
});
