import { describe, expect, it } from "vitest";

import { createFeatureTracker } from "./features";

const RATE = 48000;
const BINS = 1024;
const hzPerBin = RATE / (2 * BINS);

/** A spectrum in dB: a floor, plus peaks (Hz → dB above the floor, with a width in Hz). */
function spectrum(peaks: [hz: number, db: number, width: number][], floor = -70) {
  const out = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    const f = i * hzPerBin;
    let db = floor;
    for (const [hz, gain, width] of peaks)
      db = Math.max(db, floor + gain * Math.exp(-(((f - hz) / width) ** 2)));
    out[i] = db;
  }
  return out;
}

/** Time-domain samples at a steady RMS. */
const tone = (rms: number) =>
  Float32Array.from({ length: 2048 }, (_, i) => rms * Math.SQRT2 * Math.sin(i * 0.1));

const VOICE: [number, number, number][] = [
  [150, 40, 80],
  [400, 30, 150],
  [1200, 28, 300],
  [2200, 26, 300],
];

function run(frames: number, time: Float32Array, spec: Float32Array, t = createFeatureTracker(RATE)) {
  let f = t.update(time, spec, 1 / 60);
  for (let i = 1; i < frames; i++) f = t.update(time, spec, 1 / 60);
  return { f, t };
}

describe("voice features", () => {
  it("reads silence as silence", () => {
    const { f } = run(30, tone(0.0005), spectrum([], -110));
    expect(f.level).toBe(0);
    expect(f.open + f.round + f.spread + f.sibilance).toBe(0);
  });

  it("tells an open vowel from a spread one, against the voice's own average", () => {
    const t = createFeatureTracker(RATE);
    run(120, tone(0.1), spectrum(VOICE), t);
    const a = run(20, tone(0.1), spectrum([...VOICE, [700, 42, 120]]), t).f;
    expect(a.open).toBeGreaterThan(0.3);
    expect(a.open).toBeGreaterThan(a.spread);

    const t2 = createFeatureTracker(RATE);
    run(120, tone(0.1), spectrum(VOICE), t2);
    const i = run(20, tone(0.1), spectrum([...VOICE, [2300, 42, 250]]), t2).f;
    expect(i.spread).toBeGreaterThan(0.3);
    expect(i.spread).toBeGreaterThan(i.open);
  });

  it("hears hiss as sibilance and brightness", () => {
    const voiced = run(40, tone(0.1), spectrum(VOICE)).f;
    const hiss = run(40, tone(0.1), spectrum([[6500, 45, 1500]])).f;
    expect(hiss.sibilance).toBeGreaterThan(voiced.sibilance + 0.3);
    expect(hiss.centroid).toBeGreaterThan(voiced.centroid);
  });

  it("finds a syllable's attack once, then waits out the refractory gap", () => {
    const t = createFeatureTracker(RATE);
    run(30, tone(0.0005), spectrum([], -110), t);
    const hit = t.update(tone(0.1), spectrum(VOICE), 1 / 60);
    expect(hit.onset).toBeGreaterThan(0);
    const next = t.update(tone(0.1), spectrum(VOICE.map(([h, d, w]) => [h, d + 10, w])), 1 / 60);
    expect(next.onset).toBe(0);
  });
});
