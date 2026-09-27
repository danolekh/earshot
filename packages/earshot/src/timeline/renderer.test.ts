import { describe, expect, it } from "vitest";

import { buildPyramid } from "../core/pyramid";
import { createWaveformRenderer } from "./canvas2d";
import { canvasScale, type LaneFrame } from "./renderer";

/** A 2D context that only counts what's drawn. */
function recorder() {
  const calls = { rects: 0, clears: 0 };
  const g = {
    setTransform() {},
    clearRect: () => void calls.clears++,
    fillRect: () => void calls.rects++,
    beginPath() {},
    roundRect: () => void calls.rects++,
    fill() {},
    fillStyle: "",
    globalAlpha: 1,
  };
  const canvas = { getContext: () => g } as unknown as HTMLCanvasElement;
  const style = { color: "red", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration;
  return { calls, canvas, style };
}

const frame = (over: Partial<LaneFrame> = {}): LaneFrame => ({
  view: { from: 0, to: 60 },
  time: 0,
  duration: 60,
  width: 300,
  height: 40,
  dpr: 1,
  ...over,
});

describe("waveform renderer", () => {
  const base = { rate: 200, min: new Int8Array(12_000).fill(-40), max: new Int8Array(12_000).fill(40) };
  const pyramid = buildPyramid(base);

  it("draws a bar per 3 px of the view, whatever the call's length", () => {
    const r = recorder();
    const w = createWaveformRenderer({ source: pyramid });
    w.attach(r.canvas);
    w.restyle(r.style);
    w.draw(frame());
    expect(r.calls.rects).toBe(100);
    w.draw(frame({ view: { from: 10, to: 11 } }));
    expect(r.calls.rects).toBe(200);
  });

  it("stops at the end of the call and draws a min/max trace pixel by pixel", () => {
    const r = recorder();
    const w = createWaveformRenderer({ source: pyramid, shape: "minmax" });
    w.attach(r.canvas);
    w.restyle(r.style);
    w.draw(frame({ view: { from: 30, to: 90 }, duration: 60 }));
    expect(r.calls.rects).toBe(150);
  });

  it("redraws only when the played edge crosses a bar, or the view or size changes", () => {
    const w = createWaveformRenderer({ source: pyramid });
    expect(w.dirty!(frame({ time: 0.1 }), frame({ time: 0.2 }))).toBe(false);
    expect(w.dirty!(frame({ time: 0.1 }), frame({ time: 0.7 }))).toBe(true);
    expect(w.dirty!(frame(), frame({ view: { from: 1, to: 61 } }))).toBe(true);
  });

  it("caps the canvas for mobile browsers", () => {
    expect(canvasScale(1000, 100, 3)).toBe(2);
    expect(canvasScale(3000, 100, 2)).toBeCloseTo(4096 / 3000);
  });
});
