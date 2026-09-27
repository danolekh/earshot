/* Min/max waveform summaries at several zoom levels. The finest level is worked out once from the
 * samples and stored with the call (8-bit, base64); coarser ones are built on load, each a factor
 * coarser, so a zoomed-out view reads a few hundred bins and a zoomed-in one still has detail. */

import type { Peaks } from "./types";

/** One level: the lowest and highest sample in each bin, as signed 8-bit (-127..127), `rate` bins
 * per second. */
export interface PeakLevel {
  rate: number;
  min: Int8Array;
  max: Int8Array;
}

/** Levels from finest (`levels[0]`) to coarsest. */
export interface PeakPyramid {
  levels: readonly PeakLevel[];
}

/** A level as JSON: the bytes base64-encoded. */
export interface EncodedPeakLevel {
  rate: number;
  min: string;
  max: string;
}

const toByte = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 127);

/** The finest level of a channel's samples (-1..1), `rate` bins per second. */
export function computeMinMax(samples: Float32Array, sampleRate: number, rate = 200): PeakLevel {
  const size = Math.max(1, Math.round(sampleRate / rate));
  const bins = Math.ceil(samples.length / size);
  const min = new Int8Array(bins);
  const max = new Int8Array(bins);
  for (let b = 0; b < bins; b++) {
    let lo = 0;
    let hi = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) {
      const v = samples[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = toByte(lo);
    max[b] = toByte(hi);
  }
  return { rate: sampleRate / size, min, max };
}

/** Coarser levels from `base`, each `factor` times coarser, until a level has fewer than
 * `minBins` bins. */
export function buildPyramid(base: PeakLevel, factor = 4, minBins = 64): PeakPyramid {
  const levels = [base];
  let level = base;
  while (level.min.length > minBins) {
    const bins = Math.ceil(level.min.length / factor);
    const min = new Int8Array(bins);
    const max = new Int8Array(bins);
    for (let b = 0; b < bins; b++) {
      let lo = 127;
      let hi = -127;
      const end = Math.min(level.min.length, (b + 1) * factor);
      for (let i = b * factor; i < end; i++) {
        if (level.min[i]! < lo) lo = level.min[i]!;
        if (level.max[i]! > hi) hi = level.max[i]!;
      }
      min[b] = lo;
      max[b] = hi;
    }
    level = { rate: level.rate / factor, min, max };
    levels.push(level);
  }
  return { levels };
}

/** The coarsest level that still has at least one bin per pixel at `secondsPerPixel`; the finest
 * when zoomed in further than it goes. */
export function levelFor(pyramid: PeakPyramid, secondsPerPixel: number): PeakLevel {
  let pick = pyramid.levels[0]!;
  for (const level of pyramid.levels) if (1 / level.rate <= secondsPerPixel) pick = level;
  return pick;
}

/** The lowest and highest sample (-1..1) over `[from, to)` seconds. */
export function minMaxBetween(level: PeakLevel, from: number, to: number): readonly [number, number] {
  const a = Math.max(0, Math.floor(from * level.rate));
  const b = Math.min(level.min.length, Math.max(a + 1, Math.ceil(to * level.rate)));
  let lo = 0;
  let hi = 0;
  for (let i = a; i < b; i++) {
    if (level.min[i]! < lo) lo = level.min[i]!;
    if (level.max[i]! > hi) hi = level.max[i]!;
  }
  return [lo / 127, hi / 127];
}

function toBase64(bytes: Int8Array): string {
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Int8Array {
  const s = atob(text);
  const out = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) << 24) >> 24;
  return out;
}

export function encodePeakLevel(level: PeakLevel): EncodedPeakLevel {
  return { rate: level.rate, min: toBase64(level.min), max: toBase64(level.max) };
}

export function decodePeakLevel(encoded: EncodedPeakLevel): PeakLevel {
  return { rate: encoded.rate, min: fromBase64(encoded.min), max: fromBase64(encoded.max) };
}

/** A pyramid from the older amplitude-only overview: each bar mirrored into a min and a max. */
export function pyramidFromPeaks(peaks: Peaks): PeakPyramid {
  const max = Int8Array.from(peaks.data, (v) => toByte(v));
  const min = Int8Array.from(max, (v) => -v);
  return buildPyramid({ rate: peaks.rate, min, max });
}

/** An amplitude-only overview (0..1, normalised to the loudest) from a level, `rate` per second,
 * for the parts that draw `Peaks`. */
export function peaksFromLevel(level: PeakLevel, rate = 50): Peaks {
  const step = Math.max(1, Math.round(level.rate / rate));
  const data: number[] = [];
  let loudest = 0;
  for (let i = 0; i < level.min.length; i += step) {
    let peak = 0;
    const end = Math.min(level.min.length, i + step);
    for (let j = i; j < end; j++) peak = Math.max(peak, -level.min[j]!, level.max[j]!);
    data.push(peak);
    if (peak > loudest) loudest = peak;
  }
  const k = loudest ? 1 / loudest : 0;
  return { data: data.map((v) => Math.round(v * k * 1000) / 1000), rate: level.rate / step };
}
