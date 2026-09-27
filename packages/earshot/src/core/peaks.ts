/* Waveform overviews. Worked out once (at build time, or on the server) and stored with the call,
 * so a page draws a waveform without downloading and decoding the audio. */

import { simplex2d } from "math/noise";

import type { Peaks } from "./types";

/** Peak amplitudes of `samples`, `rate` per second, normalised so the loudest is 1. */
export function computePeaks(samples: Float32Array, sampleRate: number, rate = 50): Peaks {
  const size = Math.max(1, Math.round(sampleRate / rate));
  const data: number[] = [];
  let max = 0;
  for (let i = 0; i < samples.length; i += size) {
    let peak = 0;
    const end = Math.min(samples.length, i + size);
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j]!);
      if (v > peak) peak = v;
    }
    data.push(peak);
    if (peak > max) max = peak;
  }
  const k = max ? 1 / max : 0;
  return { data: data.map((v) => Math.round(v * k * 1000) / 1000), rate };
}

/** Peaks from audiowaveform's JSON output (`audiowaveform -i call.wav -o call.json`): its
 * min/max pairs, folded into amplitudes 0..1. */
export function fromAudiowaveform(json: {
  sample_rate: number;
  samples_per_pixel: number;
  bits: number;
  data: readonly number[];
  channels?: number;
}): Peaks {
  const full = 2 ** (json.bits - 1);
  const channels = json.channels ?? 1;
  const data: number[] = [];
  for (let i = 0; i < json.data.length; i += 2 * channels) {
    let peak = 0;
    for (let c = 0; c < channels; c++)
      peak = Math.max(peak, Math.abs(json.data[i + 2 * c]!), Math.abs(json.data[i + 2 * c + 1]!));
    data.push(Math.min(1, peak / full));
  }
  return { data, rate: json.sample_rate / json.samples_per_pixel };
}

/** The peak over `[from, to)` seconds, for drawing one bar of a narrower view. */
export function peakBetween(peaks: Peaks, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * peaks.rate));
  const b = Math.min(peaks.data.length, Math.max(a + 1, Math.ceil(to * peaks.rate)));
  let max = 0;
  for (let i = a; i < b; i++) if (peaks.data[i]! > max) max = peaks.data[i]!;
  return max;
}

const RIPPLE = simplex2d.create(11);

/** An overview drawn from word timings, for a call with no recording (a demo, a text-only
 * transcript): each word a swell, pauses flat. Deterministic, so it's the same on server and
 * client. */
export function peaksFromWords(
  turns: readonly { words: readonly { start: number; end: number }[] }[],
  duration: number,
  rate = 50,
): Peaks {
  const data = new Array<number>(Math.max(1, Math.ceil(duration * rate))).fill(0);
  for (const turn of turns)
    for (const w of turn.words) {
      const a = Math.floor(w.start * rate);
      const b = Math.max(a + 1, Math.ceil(w.end * rate));
      for (let i = a; i < b && i < data.length; i++) {
        const p = (i - a + 0.5) / (b - a);
        // A syllable-ish ripple over the word's swell.
        const ripple = 0.7 + 0.3 * Math.abs(simplex2d.sample(RIPPLE, i * 0.35, 0));
        data[i] = Math.max(data[i]!, Math.round(Math.sin(Math.PI * p) ** 0.5 * ripple * 1000) / 1000);
      }
    }
  return { data, rate };
}
