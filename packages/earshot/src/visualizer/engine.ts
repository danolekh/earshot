/* The visualizers' engine: turns a source into band levels a bar can show well. Framework-free and
 * pure apart from the clock it's given, so its rules are tested without a browser.
 * - Bars rise fast and fall slowly, like a meter, at the same speed at any frame rate.
 * - The top of each bar holds for a moment before it falls (peak hold).
 * - Silence rests on a small floor, so the bars read as dots rather than vanishing.
 * - With no voice to show, each state has its own motion: thinking sweeps, listening breathes,
 *   idle rests. See docs/research/visualizer-transcript-motion.md. */

import type { AudioSource } from "../audio/source";

export type VisualizerState = "idle" | "listening" | "thinking" | "speaking";

export interface EngineOptions {
  bands: number;
  /** Mirror the bands around the middle (voice-assistant look). */
  mirror: boolean;
  /** The resting level for silence, 0 to 1. */
  floor: number;
  /** Seconds a peak holds before it falls. */
  hold: number;
}

export interface VisualizerFrame {
  /** Each band 0 to 1, left to right. */
  levels: Float32Array;
  /** Each band's held peak 0 to 1. */
  peaks: Float32Array;
  /** Overall loudness 0 to 1. */
  level: number;
}

/** Eases a value toward a target, rising with `up` and falling with `down` per 60 Hz frame, the
 * same at any frame rate. */
export const approach = (v: number, target: number, up: number, down: number, dt: number): number => {
  const k = target > v ? up : down;
  return v + (target - v) * (1 - (1 - k) ** (dt * 60));
};

export function createVisualizerEngine(options: EngineOptions) {
  const { bands, mirror, floor, hold } = options;
  const half = mirror ? Math.ceil(bands / 2) : bands;
  const raw = new Float32Array(half);
  const levels = new Float32Array(bands);
  const peaks = new Float32Array(bands);
  const peakAge = new Float32Array(bands);
  let time = 0;
  let level = 0;

  /** What a band wants to show at time t with no voice, by state. */
  const scripted = (state: VisualizerState, i: number, t: number) => {
    const x = bands > 1 ? i / (bands - 1) : 0.5;
    if (state === "thinking") {
      // A crest travelling across and back, 1.4 s a pass.
      const head = 0.5 - 0.5 * Math.cos((t / 1.4) * Math.PI * 2);
      return floor + 0.55 * Math.exp(-(((x - head) / 0.14) ** 2));
    }
    if (state === "listening") return floor + 0.12 * (0.5 + 0.5 * Math.sin((t / 2.4) * Math.PI * 2 - x * 2));
    return floor;
  };

  return {
    step(
      source: AudioSource | null | undefined,
      state: VisualizerState | undefined,
      dt: number,
      reduced: boolean,
    ): VisualizerFrame {
      time += dt;
      const now = source?.level() ?? 0;
      level = approach(level, now, 0.5, 0.12, dt);
      if (source?.bands) source.bands(raw);
      else for (let b = 0; b < half; b++) raw[b] = now * (1 - (b / half) * 0.55);
      const voiced = now > 0.04;
      for (let i = 0; i < bands; i++) {
        const band = mirror ? Math.round(Math.abs(i - (bands - 1) / 2)) : i;
        const heard = Math.max(floor, Math.min(1, raw[Math.min(half - 1, band)] ?? 0));
        const target = reduced
          ? floor + 0.2 * now
          : voiced || state === "speaking" || !state
            ? heard
            : Math.max(heard, scripted(state, i, time));
        levels[i] = reduced ? target : approach(levels[i]!, target, 0.5, 0.12, dt);
        if (levels[i]! >= peaks[i]!) {
          peaks[i] = levels[i]!;
          peakAge[i] = 0;
        } else {
          peakAge[i]! += dt;
          if (peakAge[i]! > hold) peaks[i] = Math.max(levels[i]!, peaks[i]! - dt * 1.2);
        }
      }
      return { levels, peaks, level };
    },
  };
}
