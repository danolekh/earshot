/* Speaking and timing lines, shared by the demo calls (build.ts) and the debugger's call
 * (debugger.ts): Chatterbox or macOS `say` for the voice, ffmpeg to decode and trim, whisper.cpp
 * for word timings with the script's own words put back. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import type { Word } from "@danolekh/earshot/core";

import { speechOf } from "./quality.ts";
import { align, clean, mapUnits, refineToSpeech, type TimedWord, type Unit } from "./timing.ts";

export { align, clean } from "./timing.ts";

export const RATE = 24_000;
export const PYTHON = process.env.TTS_PYTHON ?? join(homedir(), ".cache/earshot-tts/.venv/bin/python");
export const HERE = new URL("./", import.meta.url).pathname;
export const MODEL = process.env.WHISPER_MODEL ?? join(homedir(), ".cache/whisper/ggml-small.bin");
export const OUT = new URL("./out/", import.meta.url).pathname;
export const tmp = mkdtempSync(join(tmpdir(), "earshot-calls-"));

/** Mono float samples at RATE. */
export function decode(file: string): Float32Array {
  const raw = execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"],
    {
      maxBuffer: 1 << 30,
    },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Speech starts and ends inside `say`'s output with a little silence; trim it so gaps are ours. */
export function trim(samples: Float32Array): { samples: Float32Array; lead: number } {
  const loud = (v: number) => Math.abs(v) > 0.01;
  let a = 0;
  while (a < samples.length && !loud(samples[a]!)) a++;
  let b = samples.length - 1;
  while (b > a && !loud(samples[b]!)) b--;
  const pad = Math.round(0.02 * RATE);
  a = Math.max(0, a - pad);
  b = Math.min(samples.length, b + pad);
  return { samples: samples.slice(a, b), lead: a / RATE };
}

/** Whisper's word timings for a turn's audio, with the script's own words put back. */
export function timeWords(wav: string, text: string, lang: string, lead: number): Word[] {
  execFileSync(
    "whisper-cli",
    ["-m", MODEL, "-f", wav, "-l", lang, "-ml", "1", "-sow", "-oj", "-of", wav, "-np"],
    {
      stdio: "ignore",
    },
  );
  const json = JSON.parse(readFileSync(`${wav}.json`, "utf8")) as {
    transcription: { offsets: { from: number; to: number }; text: string }[];
  };
  const heard = json.transcription
    .map((s) => ({
      text: s.text.trim(),
      start: s.offsets.from / 1000 - lead,
      end: s.offsets.to / 1000 - lead,
    }))
    .filter((w) => clean(w.text));
  const said = text.split(/\s+/).filter(Boolean);
  return align(said, heard);
}

/** One line to speak. */
export interface SpeakJob {
  text: string;
  lang: string;
  /** macOS voice for `say`. */
  say: string;
  /** Chatterbox reference clip, relative to calls/. */
  voice?: string;
  exaggeration?: number;
  cfg?: number;
  seed?: number;
  engine: "chatterbox" | "say";
}

/** Speaks each job to a file and returns the paths: Chatterbox jobs in one batch (the model loads
 * once), `say` jobs one by one. */
export function speak(jobs: readonly SpeakJob[], name: string): string[] {
  // Rendered lines are cached by what went into them, so a re-run only speaks what changed.
  const cache = join(OUT, ".tts-cache");
  mkdirSync(cache, { recursive: true });
  const out = jobs.map((j) => {
    const hash = createHash("sha1").update(JSON.stringify(j)).digest("hex").slice(0, 16);
    return join(cache, `${hash}.${j.engine === "say" ? "aiff" : "wav"}`);
  });
  const todo = jobs.map((_, i) => !existsSync(out[i]!));
  jobs.forEach((j, i) => {
    if (j.engine === "say" && todo[i]) execFileSync("say", ["-v", j.say, "-o", out[i]!, j.text]);
  });
  const batch = jobs.flatMap((j, i) =>
    j.engine === "chatterbox" && todo[i]
      ? [
          {
            text: j.text,
            lang: j.lang,
            out: out[i],
            ...(j.voice && { voice: join(HERE, j.voice) }),
            exaggeration: j.exaggeration ?? 0.5,
            cfg: j.cfg ?? 0.5,
            seed: j.seed ?? 11 + i,
          },
        ]
      : [],
  );
  if (batch.length) {
    const file = join(tmp, `${name}-jobs.json`);
    writeFileSync(file, JSON.stringify(batch));
    execFileSync(PYTHON, [join(HERE, "tts.py"), file], { stdio: ["ignore", "ignore", "inherit"] });
  }
  // Measuring writes files next to each input; keep those out of the cache.
  return out.map((file, i) => {
    const copy = join(tmp, `${name}-${i}.${file.split(".").at(-1)}`);
    copyFileSync(file, copy);
    return copy;
  });
}

/** Who times the words: Qwen3-ForcedAligner (forced alignment of the known text; the default) or
 * whisper.cpp (its own word timestamps, which drift by about a word on short German lines). */
export type Aligner = "qwen" | "whisper";

export const ALIGN_PYTHON =
  process.env.ALIGN_PYTHON ?? join(homedir(), ".cache/earshot-align/.venv/bin/python");
export const ALIGN_MODEL = "Qwen/Qwen3-ForcedAligner-0.6B";
const LANGUAGE: Readonly<Record<string, string>> = { de: "German", en: "English" };

export interface MeasureJob {
  /** The spoken file, as `speak` wrote it. */
  file: string;
  text: string;
  lang: string;
}

/** Each spoken file as trimmed samples at RATE, with its words timed relative to the trimmed start:
 * every file decoded first, then one aligner run for the lot. */
export function measureAll(
  jobs: readonly MeasureJob[],
  aligner: Aligner,
): { samples: Float32Array; words: TimedWord[] }[] {
  const ready = jobs.map((j) => {
    const wav = `${j.file}.16k.wav`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", j.file, "-ar", "16000", "-ac", "1", wav]);
    return { ...j, wav, ...trim(decode(j.file)) };
  });
  if (aligner === "whisper")
    return ready.map((r) => ({ samples: r.samples, words: timeWords(r.wav, r.text, r.lang, r.lead) }));
  const units = forcedAlign(ready.map((r) => ({ wav: r.wav, source: r.file, text: r.text, lang: r.lang })));
  return ready.map((r, i) => {
    const said = r.text.split(/\s+/).filter(Boolean);
    const shifted = units[i]!.map((u) => ({ ...u, start: u.start - r.lead, end: u.end - r.lead }));
    const { words: mapped, exact } = mapUnits(said, shifted);
    if (!exact)
      console.warn(`  aligner: some words of "${r.text}" didn't line up; spread and marked estimated`);
    const words = refineToSpeech(mapped, speechOf(r.samples, RATE));
    return { samples: cutAfter(r.samples, words), words };
  });
}

/** A spoken line without whatever the TTS kept producing after its last word (Chatterbox sometimes
 * babbles on for seconds): cut 0.15 s after that word with a short fade, then trimmed like any line
 * so it ends where its sound does (the start stays, so the words' times do too). */
function cutAfter(samples: Float32Array, words: readonly TimedWord[]): Float32Array {
  const last = words.filter((w) => clean(w.text)).at(-1);
  if (!last) return samples;
  const end = Math.min(samples.length, Math.round((last.end + 0.15) * RATE));
  if (end >= samples.length) return samples;
  const out = samples.slice(0, end);
  const fade = Math.min(end, Math.round(0.02 * RATE));
  for (let i = 0; i < fade; i++) out[end - 1 - i]! *= i / fade;
  const loud = out.findLastIndex((v) => Math.abs(v) > 0.01);
  return out.slice(0, Math.min(end, Math.max(Math.round(last.end * RATE), loud + Math.round(0.02 * RATE))));
}

/** Qwen3-ForcedAligner's units for each job, in seconds from the start of its 16 kHz file: from the
 * cache (keyed by the model, the language, the text and the audio's bytes), the rest in one run of
 * align.py. */
export function forcedAlign(
  jobs: readonly { wav: string; source: string; text: string; lang: string }[],
): Unit[][] {
  if (!existsSync(ALIGN_PYTHON))
    throw new Error(
      `No aligner at ${ALIGN_PYTHON}. Set it up (see VOICES.md):\n  uv venv ~/.cache/earshot-align/.venv --python 3.12\n  uv pip install --python ~/.cache/earshot-align/.venv/bin/python qwen-asr`,
    );
  const cache = join(OUT, ".align-cache");
  mkdirSync(cache, { recursive: true });
  const keys = jobs.map((j) => {
    const language = LANGUAGE[j.lang];
    if (!language) throw new Error(`The aligner has no language "${j.lang}"`);
    const audio = createHash("sha1").update(readFileSync(j.source)).digest("hex");
    const key = { v: 1, model: ALIGN_MODEL, language, text: j.text.normalize("NFC"), audio };
    return createHash("sha1").update(JSON.stringify(key)).digest("hex").slice(0, 16);
  });
  const out: (Unit[] | undefined)[] = keys.map((k) => {
    const file = join(cache, `${k}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { units: Unit[] }).units : undefined;
  });
  const todo = jobs.map((j, i) => ({ j, i })).filter(({ i }) => !out[i]);
  if (todo.length) {
    console.log(`  aligning ${todo.length} of ${jobs.length} chunks with ${ALIGN_MODEL}`);
    const spec = join(tmp, "align-jobs.json");
    const result = join(tmp, "align-out.json");
    writeFileSync(
      spec,
      JSON.stringify({
        model: ALIGN_MODEL,
        jobs: todo.map(({ j }) => ({ audio: j.wav, text: j.text, language: LANGUAGE[j.lang] })),
      }),
    );
    execFileSync(ALIGN_PYTHON, [join(HERE, "align.py"), spec, result], {
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" },
    });
    const results = JSON.parse(readFileSync(result, "utf8")) as ({ units: Unit[] } | { error: string })[];
    todo.forEach(({ j, i }, n) => {
      const r = results[n];
      if (!r || "error" in r)
        throw new Error(`The aligner failed on "${j.text}": ${r && "error" in r ? r.error : "no result"}`);
      out[i] = r.units;
      writeFileSync(join(cache, `${keys[i]}.json`), JSON.stringify({ units: r.units }));
    });
  }
  return out as Unit[][];
}
