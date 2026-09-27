/* What a voice is doing, beyond how loud it is: bright or dark, hissing or voiced, the attack of a
 * syllable, and roughly which vowel. Worked out once a frame from the spectrum an AnalyserNode
 * already gives, cheaply enough for every frame. The orb reads these so a voice moves it the way
 * a voice moves: a plosive kicks it, an "s" makes it shimmer, an "a" opens it and an "u" rounds it.
 * See docs/research/orb-natural.md. */

import { perceivedLevel } from "./level";

export interface VoiceFeatures {
  /** Loudness 0 to 1, as the ear hears it. */
  level: number;
  /** Spectral brightness 0 to 1: dark, chesty sound low, bright or thin sound high. */
  centroid: number;
  /** Hiss 0 to 1: the share of energy above 4 kHz (s, sh, f, z). */
  sibilance: number;
  /** Energy shares 0 to 1 in the bands where voice lives: body (80-300 Hz), vowels (300-2500 Hz),
   * texture (2.5-8 kHz). */
  low: number;
  mid: number;
  high: number;
  /** Vowel shape 0 to 1, each against the voice's own recent average: open ("a"), round ("o",
   * "u"), spread ("i", "e"). All 0 when nothing is voiced. */
  open: number;
  round: number;
  spread: number;
  /** A syllable's attack this frame, 0 to 1: nonzero only on the frame an onset is found. */
  onset: number;
}

export const SILENT: VoiceFeatures = Object.freeze({
  level: 0,
  centroid: 0,
  sibilance: 0,
  low: 0,
  mid: 0,
  high: 0,
  open: 0,
  round: 0,
  spread: 0,
  onset: 0,
});

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A one-pole follower with separate attack and release time constants (seconds), independent of
 * frame rate. */
function follower(attack: number, release: number) {
  let value = 0;
  return {
    step(target: number, dt: number) {
      const tau = target > value ? attack : release;
      value += (target - value) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
      return value;
    },
    get value() {
      return value;
    },
    set value(v: number) {
      value = v;
    },
  };
}

export interface FeatureTracker {
  /** One frame: the time-domain samples and the spectrum in dB (`getFloatTimeDomainData`,
   * `getFloatFrequencyData`), and the seconds since the last frame. */
  update(time: Float32Array, spectrumDb: Float32Array, dt: number): VoiceFeatures;
}

export interface TrackerOptions {
  /** Seconds for loudness to rise and to fall; 0.03 and 0.22 by default. */
  attack?: number;
  release?: number;
  /** The loudness range mapped to 0 to 1, in dBFS, and the gate below which it's silence;
   * -60, -12 and -55 by default. */
  floor?: number;
  ceiling?: number;
  gate?: number;
}

/** Tracks a voice's features frame by frame, for an analyser at this sample rate. */
export function createFeatureTracker(sampleRate: number, options: TrackerOptions = {}): FeatureTracker {
  const level = follower(options.attack ?? 0.03, options.release ?? 0.22);
  const centroid = follower(0.1, 0.1);
  const sibilance = follower(0.012, 0.08);
  const bands = [follower(0.06, 0.12), follower(0.06, 0.12), follower(0.06, 0.12)];
  const shape = [follower(0.06, 0.09), follower(0.06, 0.09), follower(0.06, 0.09)];
  // Long-term share of each vowel region, to measure each frame against (the fix for a voice's
  // own spectral tilt).
  const longTerm = [0.25, 0.25, 0.25, 0.25];
  let previous: Float32Array | null = null;
  const fluxHistory: number[] = [];
  let sinceOnset = Infinity;

  return {
    update(time, spectrumDb, dt) {
      const step = Math.min(Math.max(dt, 0), 0.1);
      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i]! * time[i]!;
      const loud = perceivedLevel(
        Math.sqrt(sum / Math.max(1, time.length)),
        options.floor,
        options.ceiling,
        options.gate,
      );
      const gated = loud === 0;

      const hz = sampleRate / (2 * spectrumDb.length);
      const bin = (f: number) => Math.min(spectrumDb.length - 1, Math.max(0, Math.round(f / hz)));
      const mag = (i: number) => {
        const db = spectrumDb[i]!;
        return Number.isFinite(db) ? 10 ** (db / 20) : 0;
      };
      const energy = (from: number, to: number) => {
        let e = 0;
        for (let i = bin(from); i < bin(to); i++) {
          const m = mag(i);
          e += m * m;
        }
        return e;
      };

      // Brightness: the magnitude-weighted mean frequency over the voice's range, on a log scale.
      let num = 0;
      let den = 0;
      for (let i = bin(80); i < bin(8000); i++) {
        const m = mag(i);
        num += i * hz * m;
        den += m;
      }
      const c = den > 0 ? clamp01(Math.log2(num / den / 400) / Math.log2(10)) : 0;

      const eLow = energy(80, 300);
      const eMid = energy(300, 2500);
      const eHigh = energy(2500, 8000);
      const eHiss = energy(4000, 10000);
      const total = eLow + eMid + eHigh + 1e-12;

      // Vowel regions: low F1 (200-500), high F1 (500-900), low F2 (900-1500), high F2 (1500-3000).
      const r = [energy(200, 500), energy(500, 900), energy(900, 1500), energy(1500, 3000)];
      const rSum = r[0]! + r[1]! + r[2]! + r[3]! + 1e-12;
      const share = r.map((x) => x / rSum);
      const dev = share.map((s, k) => s - longTerm[k]!);
      if (!gated) share.forEach((s, k) => (longTerm[k]! += (s - longTerm[k]!) * (1 - Math.exp(-step / 1.5))));
      const voiced = gated ? 0 : clamp01(loud * 2);
      const open = clamp01((dev[1]! - dev[0]!) * 4) * voiced;
      const round = clamp01((dev[0]! + dev[2]! - (dev[1]! + dev[3]!)) * 3) * voiced;
      const spread = clamp01((dev[3]! - dev[2]!) * 4) * voiced;

      // Onsets: the rectified rise of the log spectrum since the last frame, against its recent
      // median, with a refractory gap so one syllable counts once.
      let flux = 0;
      let n = 0;
      if (previous && previous.length === spectrumDb.length)
        for (let i = bin(80); i < bin(8000); i++) {
          const a = spectrumDb[i]!;
          const b = previous[i]!;
          if (Number.isFinite(a) && Number.isFinite(b)) {
            flux += Math.max(0, a - b);
            n++;
          }
        }
      flux = n ? flux / n : 0;
      previous = Float32Array.from(spectrumDb);
      fluxHistory.push(flux);
      const keep = Math.max(8, Math.round(0.5 / Math.max(step, 1 / 120)));
      while (fluxHistory.length > keep) fluxHistory.shift();
      const median = [...fluxHistory].sort((x, y) => x - y)[fluxHistory.length >> 1] ?? 0;
      const threshold = median * 1.5 + 0.8;
      sinceOnset += step;
      let onset = 0;
      if (!gated && flux > threshold && sinceOnset > 0.1) {
        onset = clamp01((flux - threshold) / (threshold + 1e-6) + 0.35);
        sinceOnset = 0;
      }

      return {
        level: level.step(loud, step),
        centroid: gated ? centroid.value : centroid.step(c, step),
        sibilance: sibilance.step(gated ? 0 : clamp01((eHiss / total - 0.04) / 0.35), step),
        low: bands[0]!.step(gated ? 0 : eLow / total, step),
        mid: bands[1]!.step(gated ? 0 : eMid / total, step),
        high: bands[2]!.step(gated ? 0 : eHigh / total, step),
        open: shape[0]!.step(open, step),
        round: shape[1]!.step(round, step),
        spread: shape[2]!.step(spread, step),
        onset,
      };
    },
  };
}
