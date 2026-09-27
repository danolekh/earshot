/* Builds the demo calls in ./scripts.ts into out/<id>.mp3 (the mixed recording) and
 * out/<id>.json (an earshot Conversation: turns with whisper-timed words, events, per-speaker
 * peaks). Each turn is spoken, its words timed by forced alignment of the script's text
 * (Qwen3-ForcedAligner; whisper.cpp with `--aligner whisper`), then placed on the call's timeline; a barge-in
 * cuts the agent's audio where the caller comes in, and its later words stay in the data as
 * unspoken.
 *
 *   node calls/build.ts [id…] [--engine chatterbox|say] [--aligner qwen|whisper]
 *
 * Voices come from Chatterbox Multilingual (Resemble AI, MIT) run locally through calls/tts.py,
 * in a venv at ~/.cache/earshot-tts (or TTS_PYTHON); see VOICES.md. `--engine say` uses macOS
 * voices instead, for a quick draft. Also needs ffmpeg and whisper-cli (brew install
 * whisper-cpp) with a model at ~/.cache/whisper/ggml-small.bin (or WHISPER_MODEL). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createConversation, computePeaks } from "@danolekh/earshot/core";
import type { ConversationEvent, EventInput, TurnInput } from "@danolekh/earshot/core";

import { checkAlignment, formatReport, speechOf } from "./quality.ts";
import { type Aligner, clean, HERE, measureAll, OUT, PYTHON, RATE, tmp } from "./render.ts";
import { type CallScript, SCRIPTS } from "./scripts.ts";

const ENGINE = process.argv.includes("--engine")
  ? process.argv[process.argv.indexOf("--engine") + 1]
  : "chatterbox";
const ALIGNER = (
  process.argv.includes("--aligner") ? process.argv[process.argv.indexOf("--aligner") + 1] : "qwen"
) as Aligner;
function build(script: CallScript) {
  console.log(`${script.id}`);
  // Speak every line: Chatterbox in one batch (the model loads once), or macOS `say`.
  const raw = script.turns.map((_, i) =>
    join(tmp, `${script.id}-${i}.${ENGINE === "say" ? "aiff" : "tts.wav"}`),
  );
  if (ENGINE === "say")
    script.turns.forEach((turn, i) =>
      execFileSync("say", ["-v", script.say[turn.role], "-o", raw[i]!, turn.text]),
    );
  else {
    const jobs = script.turns.map((turn, i) => {
      const voice = script.voices[turn.role];
      return {
        text: turn.text,
        lang: script.lang,
        out: raw[i],
        ...(voice.prompt && { voice: join(HERE, voice.prompt) }),
        exaggeration: turn.exaggeration ?? voice.exaggeration ?? 0.5,
        cfg: voice.cfg ?? 0.5,
        seed: 11 + i,
      };
    });
    const file = join(tmp, `${script.id}-jobs.json`);
    writeFileSync(file, JSON.stringify(jobs));
    execFileSync(PYTHON, [join(HERE, "tts.py"), file], { stdio: ["ignore", "ignore", "inherit"] });
  }
  // Every line timed in one aligner run, then checked against its own speech (warn only: these
  // calls are rebuilt by hand).
  const measured = measureAll(
    script.turns.map((turn, i) => ({ file: raw[i]!, text: turn.text, lang: script.lang })),
    ALIGNER,
  );
  const spoken = script.turns.map((turn, i) => {
    const { samples, words } = measured[i]!;
    return { turn, samples, words, duration: samples.length / RATE };
  });
  console.log(
    formatReport(
      spoken.map(({ samples, words }, i) => ({
        line: `turn ${i}`,
        ...checkAlignment(words, speechOf(samples, RATE)),
      })),
    ),
  );

  // Place the turns: after the previous one's end plus its gap, or, for a barge-in, as the agent
  // reaches the named word.
  const placed: { start: number; interruptedAt?: number }[] = [];
  let end = 0;
  spoken.forEach(({ turn, words, duration }, i) => {
    if (turn.barge && i > 0) {
      const prev = spoken[i - 1]!;
      const at = prev.words.findIndex((w) => clean(w.text) === clean(turn.barge!));
      if (at < 0) throw new Error(`${script.id}: no word "${turn.barge}" in turn ${i - 1}`);
      const cut = placed[i - 1]!.start + prev.words[at]!.start;
      // The agent hears the caller a beat after they start, and stops at the next word boundary.
      placed[i - 1]!.interruptedAt = cut + 0.25;
      placed.push({ start: cut });
      end = cut + duration;
      return;
    }
    const start = end + (turn.gap ?? 0.5);
    placed.push({ start });
    end = start + duration;
    void words;
  });

  const length = Math.ceil((end + 0.6) * RATE);
  const lanes = { agent: new Float32Array(length), user: new Float32Array(length) };
  spoken.forEach(({ turn, samples }, i) => {
    const { start, interruptedAt } = placed[i]!;
    const at = Math.round(start * RATE);
    const stop = interruptedAt === undefined ? samples.length : Math.round((interruptedAt - start) * RATE);
    const fade = Math.round(0.06 * RATE);
    const lane = lanes[turn.role];
    for (let j = 0; j < Math.min(stop, samples.length); j++) {
      const g = interruptedAt !== undefined && j > stop - fade ? (stop - j) / fade : 1;
      lane[at + j] = (lane[at + j] ?? 0) + samples[j]! * g;
    }
  });
  const mix = new Float32Array(length);
  for (let j = 0; j < length; j++)
    mix[j] = Math.max(-1, Math.min(1, lanes.agent[j]! * 0.9 + lanes.user[j]! * 0.9));

  mkdirSync(OUT, { recursive: true });
  const pcm = join(tmp, `${script.id}.f32`);
  writeFileSync(pcm, Buffer.from(mix.buffer));
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "f32le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    pcm,
    "-af",
    "loudnorm=I=-18:TP=-1.5",
    "-b:a",
    "64k",
    join(OUT, `${script.id}.mp3`),
  ]);

  const turns: TurnInput[] = spoken.map(({ turn, words }, i) => {
    const { start, interruptedAt } = placed[i]!;
    return {
      role: turn.role,
      speaker: script.speakers[turn.role],
      words: words.map((w) => ({
        text: w.text,
        start: +(start + w.start).toFixed(3),
        end: +(start + w.end).toFixed(3),
      })),
      start: +start.toFixed(3),
      end: +(interruptedAt ?? start + spoken[i]!.duration).toFixed(3),
      ...(interruptedAt !== undefined && { interruptedAt: +interruptedAt.toFixed(3) }),
    };
  });

  const events: EventInput[] = [];
  for (const e of script.events) {
    const turn = turns[e.turn]!;
    const at = +((e.edge === "start" ? turn.start! : turn.end!) + e.offset).toFixed(3);
    const next = turns.slice(e.turn + 1).find((t) => t.role === "agent");
    const ref = {
      turnId: `t${e.edge === "end" && e.event.type === "tool_call" && next ? turns.indexOf(next) : e.turn}`,
    };
    if (e.event.type === "tool_call") {
      const { duration, ...rest } = e.event;
      events.push({ ...rest, status: rest.status ?? "ok", at, end: +(at + duration).toFixed(3), ...ref });
    } else events.push({ ...e.event, at, ...(e.event.type === "verdict" ? {} : ref) } as EventInput);
  }
  // The wait before each agent reply, and (for the contact-centre call) its stages: recognising the
  // caller's last words, the model, the first audio from speech synthesis.
  turns.forEach((t, i) => {
    const prev = turns[i - 1];
    if (t.role !== "agent" || !prev || prev.role !== "user") return;
    const from = prev.end!;
    const to = t.start!;
    if (to <= from) return;
    events.push({ type: "latency", kind: "e2e", at: from, end: to, turnId: `t${i}` });
    if (!script.stages) return;
    const stt = Math.min(0.16, (to - from) * 0.2);
    const tts = Math.min(0.24, (to - from) * 0.25);
    events.push({ type: "latency", kind: "stt", at: from, end: +(from + stt).toFixed(3), turnId: `t${i}` });
    events.push({
      type: "latency",
      kind: "llm",
      at: +(from + stt).toFixed(3),
      end: +(to - tts).toFixed(3),
      turnId: `t${i}`,
    });
    events.push({ type: "latency", kind: "tts", at: +(to - tts).toFixed(3), end: to, turnId: `t${i}` });
  });

  const duration = +(length / RATE).toFixed(3);
  const conversation = createConversation({
    id: script.id,
    duration,
    turns,
    events,
    peaks: {
      agent: computePeaks(lanes.agent, RATE, 40),
      user: computePeaks(lanes.user, RATE, 40),
    },
  });
  writeFileSync(join(OUT, `${script.id}.json`), JSON.stringify(conversation) + "\n");
  const barged = conversation.turns.filter((t) => t.interruptedAt !== undefined).length;
  console.log(
    `  ${duration}s, ${conversation.turns.length} turns, ${conversation.events.length} events (${(conversation.events as ConversationEvent[]).filter((e) => e.type === "tool_call").length} tool calls), ${barged} barge-in`,
  );
}

const only = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--engine" && all[i - 1] !== "--aligner");
for (const script of SCRIPTS) if (!only.length || only.includes(script.id)) build(script);
