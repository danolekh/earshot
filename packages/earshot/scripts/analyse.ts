/* A voice's features from a recording, frame by frame, for rendering: the same feature tracker a
 * live microphone goes through (src/audio/features.ts, from the build), fed by an FFT of each
 * frame's window instead of an AnalyserNode. Used by orb-video.ts and the promo stage. */
import { execFileSync } from "node:child_process";

const N = 2048;
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));

/** Magnitude spectrum in dB (N/2 bins) of a real window, by an iterative radix-2 FFT. */
export function spectrumDb(win: Float32Array): Float32Array {
  const re = Float64Array.from(win, (v, i) => v * hann[i]!);
  const im = new Float64Array(N);
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j]!, re[i]!];
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
  }
  const out = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) out[k] = 20 * Math.log10((2 * Math.hypot(re[k]!, im[k]!)) / N + 1e-12);
  return out;
}

/** Mono float samples of an audio file (or a slice of it), at `rate`. */
export function decode(file: string, rate: number, from = 0, to?: number): Float32Array {
  const args = ["-loglevel", "error", "-ss", String(from), ...(to ? ["-to", String(to)] : []), "-i", file];
  const raw = execFileSync("ffmpeg", [...args, "-f", "f32le", "-ac", "1", "-ar", String(rate), "-"], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** The features at each of `fps` frames a second over `track`. */
export async function analyse(
  track: Float32Array,
  rate: number,
  fps: number,
): Promise<Record<string, number>[]> {
  const { createFeatureTracker } = await import(new URL("../dist/audio/features.js", import.meta.url).href);
  const tracker = createFeatureTracker(rate);
  const out: Record<string, number>[] = [];
  const count = Math.floor((track.length / rate) * fps);
  for (let f = 0; f < count; f++) {
    const end = Math.round(((f + 1) / fps) * rate);
    const win = new Float32Array(N);
    win.set(track.subarray(Math.max(0, end - N), end), Math.max(0, N - end));
    const timeWin = Float32Array.from(track.subarray(Math.max(0, end - Math.round(0.04 * rate)), end));
    out.push(tracker.update(timeWin, spectrumDb(win), 1 / fps));
  }
  return out;
}
