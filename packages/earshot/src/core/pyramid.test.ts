import { describe, expect, it } from "vitest";

import {
  buildPyramid,
  computeMinMax,
  decodePeakLevel,
  encodePeakLevel,
  levelFor,
  minMaxBetween,
  peaksFromLevel,
} from "./pyramid";

/** One second of a 1 kHz sine at 8 kHz, loud in its first half only. */
function tone(): Float32Array {
  const out = new Float32Array(8000);
  for (let i = 0; i < out.length; i++)
    out[i] = (i < 4000 ? 0.8 : 0.1) * Math.sin((2 * Math.PI * 1000 * i) / 8000);
  return out;
}

describe("peak pyramid", () => {
  const base = computeMinMax(tone(), 8000, 200);

  it("keeps each bin's lowest and highest sample", () => {
    expect(base.rate).toBe(200);
    expect(base.min.length).toBe(200);
    expect(base.max[0]).toBe(Math.round(0.8 * 127));
    expect(base.min[0]).toBe(-Math.round(0.8 * 127));
    expect(base.max[150]).toBe(Math.round(0.1 * 127));
  });

  it("builds coarser levels that agree with a scan of the finest", () => {
    const p = buildPyramid(base, 4, 8);
    expect(p.levels.map((l) => l.min.length)).toEqual([200, 50, 13, 4]);
    for (const level of p.levels)
      for (const [from, to] of [
        [0, 0.5],
        [0.3, 0.9],
        [0.5, 1],
      ] as const) {
        const [lo, hi] = minMaxBetween(level, from, to);
        const [blo, bhi] = minMaxBetween(base, from, to);
        // A coarse bin can reach a little past the window; it never misses a peak inside it.
        expect(hi).toBeGreaterThanOrEqual(bhi);
        expect(lo).toBeLessThanOrEqual(blo);
      }
  });

  it("picks the coarsest level with a bin per pixel", () => {
    const p = buildPyramid(base, 4, 8);
    expect(levelFor(p, 0.001).rate).toBe(200);
    expect(levelFor(p, 0.02).rate).toBe(50);
    expect(levelFor(p, 0.1).rate).toBe(12.5);
    expect(levelFor(p, 1).rate).toBe(3.125);
  });

  it("survives a base64 round trip", () => {
    const back = decodePeakLevel(encodePeakLevel(base));
    expect(back.rate).toBe(base.rate);
    expect(Array.from(back.min)).toEqual(Array.from(base.min));
    expect(Array.from(back.max)).toEqual(Array.from(base.max));
  });

  it("folds into an amplitude overview for the older parts", () => {
    const p = peaksFromLevel(base, 50);
    expect(p.rate).toBe(50);
    expect(p.data[0]).toBe(1);
    expect(p.data[40]).toBeCloseTo(0.1 / 0.8, 1);
  });
});
