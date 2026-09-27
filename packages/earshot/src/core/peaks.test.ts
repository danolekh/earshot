import { describe, expect, it } from "vitest";

import { computePeaks, fromAudiowaveform, peakBetween } from "./peaks";

describe("peaks", () => {
  it("takes the peak of each window, normalised", () => {
    const samples = new Float32Array([0.1, -0.5, 0.2, 0.25, 0, 0]);
    expect(computePeaks(samples, 6, 3)).toEqual({ data: [1, 0.5, 0], rate: 3 });
  });

  it("reads audiowaveform's min/max pairs", () => {
    const p = fromAudiowaveform({
      sample_rate: 8000,
      samples_per_pixel: 80,
      bits: 8,
      data: [-64, 32, -8, 127],
    });
    expect(p.rate).toBe(100);
    expect(p.data[0]).toBeCloseTo(0.5);
    expect(p.data[1]).toBeCloseTo(127 / 128);
  });

  it("finds the loudest peak in a span", () => {
    expect(peakBetween({ data: [0.1, 0.9, 0.3], rate: 1 }, 0, 1)).toBe(0.1);
    expect(peakBetween({ data: [0.1, 0.9, 0.3], rate: 1 }, 0.5, 2.5)).toBe(0.9);
  });
});
