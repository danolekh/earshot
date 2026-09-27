/* Making the recording sound like a phone call and writing it the way LiveKit's recorder does: the
 * caller band-limited to the telephone band through an 8 kHz mu-law round trip with a little line
 * noise, the agent clean, caller on the left and agent on the right, as Ogg Opus and MP3. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { decode, RATE, tmp } from "./render.ts";

const f32 = (samples: Float32Array, name: string): string => {
  const file = join(tmp, `${name}.f32`);
  writeFileSync(file, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  return file;
};

const input = (file: string, channels = 1) => [
  "-f",
  "f32le",
  "-ar",
  String(RATE),
  "-ac",
  String(channels),
  "-i",
  file,
];

/** The caller as the phone network delivers them: 300-3400 Hz, 8 kHz mu-law, back to RATE. */
export function telephone(samples: Float32Array): Float32Array {
  const pcm = f32(samples, "caller-clean");
  const wav = join(tmp, "caller-8k.wav");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...input(pcm),
    "-af",
    "highpass=f=300,lowpass=f=3400",
    "-ar",
    "8000",
    "-c:a",
    "pcm_mulaw",
    wav,
  ]);
  const back = decode(wav);
  // Resampling can shift the length by a sample or two; keep it on the call's timeline.
  const out = new Float32Array(samples.length);
  out.set(back.subarray(0, samples.length));
  return out;
}

/** Seeded pink-ish noise at `dbfs` (RMS), added in place: the line's hiss, the same every build. */
export function addNoise(samples: Float32Array, dbfs: number, seed = 7): void {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
  // Paul Kellet's economy pink filter.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  const noise = new Float32Array(samples.length);
  let sum = 0;
  for (let i = 0; i < noise.length; i++) {
    const w = random();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    noise[i] = b0 + b1 + b2 + w * 0.1848;
    sum += noise[i]! * noise[i]!;
  }
  const gain = 10 ** (dbfs / 20) / Math.sqrt(sum / noise.length || 1);
  for (let i = 0; i < samples.length; i++) samples[i]! += noise[i]! * gain;
}

/** Scales in place so the loudest sample is `peak`. */
export function normalize(samples: Float32Array, peak = 0.8): void {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  if (!max) return;
  const k = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i]! *= k;
}

/** Writes `<base>.ogg` (Opus) and `<base>.mp3`, stereo: caller left, agent right. */
export function writeStereo(caller: Float32Array, agent: Float32Array, base: string): void {
  const stereo = new Float32Array(caller.length * 2);
  for (let i = 0; i < caller.length; i++) {
    stereo[2 * i] = Math.max(-1, Math.min(1, caller[i]!));
    stereo[2 * i + 1] = Math.max(-1, Math.min(1, agent[i] ?? 0));
  }
  const pcm = f32(stereo, "stereo");
  const common = ["-y", "-loglevel", "error", ...input(pcm, 2), "-ar", "48000"];
  execFileSync("ffmpeg", [
    ...common,
    "-c:a",
    "libopus",
    "-b:a",
    "48k",
    "-application",
    "voip",
    `${base}.ogg`,
  ]);
  execFileSync("ffmpeg", [...common, "-c:a", "libmp3lame", "-b:a", "96k", `${base}.mp3`]);
}

/** Writes `<base>.mp3`, mono: both sides mixed, as ElevenLabs Agents keeps a call. */
export function writeMono(samples: Float32Array, base: string): void {
  const clipped = samples.map((v) => Math.max(-1, Math.min(1, v)));
  const pcm = f32(clipped, "mono");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...input(pcm, 1),
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    `${base}.mp3`,
  ]);
}
