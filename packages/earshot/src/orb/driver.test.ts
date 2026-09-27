import { describe, expect, it } from "vitest";

import type { AudioSource } from "../audio/source";
import { createOrbDriver, type OrbSample } from "./driver";
import type { OrbState } from "./orb";

const steady = (level: number): AudioSource => ({ level: () => level });

function run(
  state: OrbState,
  seconds: number,
  source: AudioSource | ((t: number) => number) = steady(0.7),
  reducedMotion = false,
  each?: (s: OrbSample, t: number) => void,
) {
  let t = 0;
  const src = typeof source === "function" ? { level: () => source(t / 1000) } : source;
  const driver = createOrbDriver(() => t);
  driver.configure({ state, input: src, output: src, reducedMotion });
  let s = driver.sample();
  for (let f = 0; f < seconds * 60; f++) {
    t += 1000 / 60;
    s = driver.sample();
    each?.(s, t / 1000);
  }
  return s;
}

describe("the orb's driver", () => {
  it("follows a state once it has held, and settles there", () => {
    const s = run("speaking", 3);
    expect(s.speaking).toBeCloseTo(1, 2);
    expect(s.idle).toBeCloseTo(0, 2);
  });

  it("swells with the voice, more speaking than listening, and never past 14%", () => {
    const speaking = run("speaking", 3, steady(1));
    const listening = run("listening", 3, steady(1));
    expect(speaking.scale).toBeGreaterThan(listening.scale);
    let max = 0;
    run(
      "speaking",
      4,
      (t) => (Math.sin(t * 30) > 0 ? 1 : 0),
      false,
      (s) => (max = Math.max(max, s.scale)),
    );
    expect(max).toBeLessThanOrEqual(1.14);
  });

  it("bounces softly: a sudden syllable overshoots a little, then settles", () => {
    let peak = 0;
    const s = run(
      "speaking",
      2,
      (t) => (t > 1 ? 1 : 0),
      false,
      (x, t) => t > 1 && (peak = Math.max(peak, x.scale)),
    );
    expect(peak).toBeGreaterThan(s.scale);
    expect(s.scale).toBeCloseTo(1.055, 2);
  });

  it("rises faster than it falls", () => {
    let up = 0;
    run("speaking", 0.1, steady(1), false, (s) => (up = s.level));
    let down = 1;
    run(
      "speaking",
      2.1,
      (t) => (t < 2 ? 1 : 0),
      false,
      (s) => (down = s.level),
    );
    expect(up).toBeGreaterThan(1 - down);
  });

  it("brightens and grows its aura with the voice while speaking", () => {
    const loud = run("speaking", 2, steady(1));
    const quiet = run("speaking", 2, steady(0));
    expect(loud.bright).toBeGreaterThan(quiet.bright + 0.06);
    expect(loud.aura).toBeGreaterThan(quiet.aura + 0.2);
  });

  it("thinks on a clock, not on audio: the same with or without a voice", () => {
    const loud = run("thinking", 2, steady(1));
    const quiet = run("thinking", 2, steady(0));
    expect(loud.think).toBeCloseTo(1, 1);
    expect(loud.phase).toBeCloseTo(quiet.phase, 5);
    expect(loud.scale).toBeCloseTo(quiet.scale, 5);
    expect(run("speaking", 2).think).toBeLessThan(0.01);
  });

  it("carries the state in its speed: the flow runs faster speaking than idle", () => {
    expect(run("speaking", 2, steady(0.8)).phase).toBeGreaterThan(run("idle", 2).phase * 5);
  });

  it("holds still under reduced motion, showing the state by light alone", () => {
    const s = run("speaking", 2, steady(1), true);
    expect(s.phase).toBe(0);
    expect(s.scale).toBe(1);
    expect(s.bright).toBeGreaterThan(1.05);
  });

  it("samples once per frame", () => {
    let calls = 0;
    const counted: AudioSource = { level: () => (calls++, 0.5) };
    let t = 0;
    const driver = createOrbDriver(() => t);
    driver.configure({ state: "listening", input: counted, reducedMotion: false });
    driver.sample();
    t += 1;
    driver.sample();
    expect(calls).toBe(1);
  });
});

describe("liveliness and syllables", () => {
  const syllables = (t: number) => ({ onset: Math.floor(t * 4) !== Math.floor((t - 1 / 60) * 4) ? 0.9 : 0 });
  const voiced = (lvl: number): AudioSource => {
    let t = 0;
    return {
      level: () => lvl,
      features: () => {
        t += 1 / 60;
        return {
          level: lvl,
          centroid: 0.5,
          sibilance: 0,
          low: 0.3,
          mid: 0.5,
          high: 0.2,
          open: 0,
          round: 0,
          spread: 0,
          ...syllables(t),
        };
      },
    };
  };
  const peakScale = (liveliness: number) => {
    let t = 0;
    let peak = 0;
    const driver = createOrbDriver(() => t);
    driver.configure({ state: "speaking", output: voiced(0.6), reducedMotion: false, liveliness });
    for (let f = 0; f < 180; f++) {
      t += 1000 / 60;
      const s = driver.sample();
      if (f > 60) peak = Math.max(peak, s.scale);
    }
    return peak;
  };

  it("kicks on every syllable and flashes a pulse that fades", () => {
    let t = 0;
    const pulses: number[] = [];
    const driver = createOrbDriver(() => t);
    driver.configure({ state: "speaking", output: voiced(0.6), reducedMotion: false });
    for (let f = 0; f < 120; f++) {
      t += 1000 / 60;
      pulses.push(driver.sample().pulse);
    }
    expect(Math.max(...pulses)).toBeGreaterThan(0.3);
    expect(Math.min(...pulses.slice(60))).toBeLessThan(0.15);
  });

  it("moves more the livelier it's set", () => {
    expect(peakScale(1.6)).toBeGreaterThan(peakScale(0.8));
  });
});

describe("the start of speech", () => {
  it("responds to the first syllable within a tenth of a second", () => {
    let t = 0;
    const driver = createOrbDriver(() => t);
    const quiet = { level: () => 0 };
    driver.configure({ state: "idle", input: quiet, output: quiet, reducedMotion: false });
    for (let f = 0; f < 120; f++) {
      t += 1000 / 60;
      driver.sample();
    }
    const before = driver.sample();
    const voice = { level: () => 0.8 };
    driver.configure({ state: "listening", input: voice, reducedMotion: false });
    let first = Infinity;
    for (let f = 1; f <= 30; f++) {
      t += 1000 / 60;
      const s = driver.sample();
      if (first === Infinity && s.level > 0.3) first = f / 60;
    }
    expect(first).toBeLessThan(0.12);
    expect(before.level).toBe(0);
  });
});

describe("play", () => {
  const settle = (driver: ReturnType<typeof createOrbDriver>, frames: number, clock: { t: number }) => {
    let s = driver.sample();
    for (let f = 0; f < frames; f++) {
      clock.t += 1000 / 60;
      s = driver.sample();
    }
    return s;
  };

  it("squishes while pressed and bounces back past its size when let go", () => {
    const clock = { t: 0 };
    const driver = createOrbDriver(() => clock.t);
    // No breathing (liveliness 0), so the press is all that moves it.
    driver.configure({ state: "idle", reducedMotion: false, liveliness: 0 });
    driver.interact({ type: "move", x: 0, y: 0 });
    const rest = settle(driver, 60, clock).scale;
    driver.interact({ type: "down", x: 0, y: 0 });
    const pressed = settle(driver, 20, clock).scale;
    expect(pressed).toBeLessThan(rest - 0.03);
    driver.interact({ type: "up" });
    let peak = 0;
    for (let f = 0; f < 30; f++) {
      clock.t += 1000 / 60;
      peak = Math.max(peak, driver.sample().scale);
    }
    expect(peak).toBeGreaterThan(rest);
  });

  it("spins on a drag and keeps turning once let go, slowing down", () => {
    const clock = { t: 0 };
    const driver = createOrbDriver(() => clock.t);
    driver.configure({ state: "idle", reducedMotion: false });
    const before = settle(driver, 10, clock).spin;
    driver.interact({ type: "down", x: -0.6, y: 0 });
    driver.interact({ type: "move", x: 0.6, y: 0 });
    driver.interact({ type: "up" });
    const after = settle(driver, 60, clock).spin;
    expect(after - before).toBeGreaterThan(1);
  });

  it("starts a ripple where it's tapped, and follows the pointer with its highlight", () => {
    const clock = { t: 0 };
    const driver = createOrbDriver(() => clock.t);
    driver.configure({ state: "idle", reducedMotion: false });
    driver.interact({ type: "down", x: 0.3, y: -0.2 });
    const s = settle(driver, 30, clock);
    expect(s.tapX).toBe(0.3);
    expect(s.tapAge).toBeCloseTo(0.5, 1);
    expect(s.hover).toBeGreaterThan(0.9);
    driver.interact({ type: "leave" });
    expect(settle(driver, 60, clock).hover).toBeLessThan(0.05);
  });
});
