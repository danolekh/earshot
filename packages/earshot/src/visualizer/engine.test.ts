import { describe, expect, it } from "vitest";

import { approach, createVisualizerEngine } from "./engine";

const steady = (level: number) => ({ level: () => level });

describe("the visualizer engine", () => {
  it("rises fast and falls slowly, the same at any frame rate", () => {
    let fast = 0;
    for (let i = 0; i < 6; i++) fast = approach(fast, 1, 0.5, 0.12, 1 / 60);
    let slow = 0;
    for (let i = 0; i < 3; i++) slow = approach(slow, 1, 0.5, 0.12, 1 / 30);
    expect(fast).toBeCloseTo(slow, 5);
    let fall = 1;
    for (let i = 0; i < 6; i++) fall = approach(fall, 0, 0.5, 0.12, 1 / 60);
    expect(1 - fall).toBeLessThan(fast);
  });

  it("holds each peak before it falls, and rests on a floor in silence", () => {
    const e = createVisualizerEngine({ bands: 3, mirror: false, floor: 0.06, hold: 0.4 });
    for (let i = 0; i < 30; i++) e.step(steady(0.9), "speaking", 1 / 60, false);
    let f = e.step(steady(0), "speaking", 1 / 60, false);
    for (let i = 0; i < 12; i++) f = e.step(steady(0), "speaking", 1 / 60, false);
    const held = f.peaks[0]!;
    expect(held).toBeGreaterThan(0.8);
    for (let i = 0; i < 120; i++) f = e.step(steady(0), "speaking", 1 / 60, false);
    expect(f.peaks[0]!).toBeLessThan(held);
    expect(f.levels[0]!).toBeCloseTo(0.06, 2);
  });

  it("sweeps while thinking with no voice, and mirrors around the middle", () => {
    const e = createVisualizerEngine({ bands: 9, mirror: true, floor: 0.05, hold: 0.4 });
    let f = e.step(steady(0), "thinking", 1 / 60, false);
    const seen = new Set<number>();
    for (let i = 0; i < 90; i++) {
      f = e.step(steady(0), "thinking", 1 / 60, false);
      seen.add(f.levels.indexOf(Math.max(...f.levels)));
    }
    expect(seen.size).toBeGreaterThan(3);
    const e2 = createVisualizerEngine({ bands: 9, mirror: true, floor: 0.05, hold: 0.4 });
    for (let i = 0; i < 30; i++) f = e2.step(steady(0.8), "speaking", 1 / 60, false);
    expect(f.levels[0]).toBeCloseTo(f.levels[8]!, 5);
  });
});
