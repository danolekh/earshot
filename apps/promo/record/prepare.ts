/* The teaser's sound and what the orb hears in it: a second of silence, the insurance caller's
 * first line and the agent's answer straight from the recorded call (their real gap between),
 * then a rest. Writes the track (out/teaser-track.f32, 24 kHz mono) and the voice's features at
 * 120 frames a second, with the timeline, for the stage (apps/docs/public/stage/teaser.json).
 *
 *   pnpm --filter @danolekh/earshot build && pnpm --filter promo prepare-teaser */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { analyse, decode } from "../../../packages/earshot/scripts/analyse.ts";

const RATE = 24000;
const FPS = 120;
const LEAD = 1.0;
const TAIL = 2.6;
const here = (p: string) => new URL(p, import.meta.url).pathname;
const call = JSON.parse(readFileSync(here("../../../calls/out/alder-mutual-address.json"), "utf8"));
const ask = call.turns[1];
const answer = call.turns[2];
if (ask.role !== "user" || answer.role !== "agent") throw new Error("the call's turns moved");

const from = ask.start - 0.05;
const to = answer.end + 0.15;
const speech = decode(here("../../../calls/out/alder-mutual-address.mp3"), RATE, from, to);
const track = new Float32Array(Math.round((LEAD + (to - from) + TAIL) * RATE));
track.set(speech, Math.round(LEAD * RATE));
const shift = LEAD - from;
const turn = (t: { role: string; words: { text: string; start: number; end: number }[] }) => ({
  role: t.role,
  words: t.words.map((w) => ({
    text: w.text,
    start: +(w.start + shift).toFixed(3),
    end: +(w.end + shift).toFixed(3),
  })),
});

const features = await analyse(track, RATE, FPS);
mkdirSync(here("../out/"), { recursive: true });
writeFileSync(here("../out/teaser-track.f32"), Buffer.from(track.buffer));
const round = (v: number) => Math.round(v * 1000) / 1000;
writeFileSync(
  here("../../docs/public/stage/teaser.json"),
  JSON.stringify({
    fps: FPS,
    duration: +(track.length / RATE).toFixed(3),
    turns: [turn(ask), turn(answer)],
    features: features.map((f) => [
      round(f.level),
      round(f.centroid),
      round(f.sibilance),
      round(f.low),
      round(f.onset),
    ]),
  }),
);
console.log(`teaser: ${(track.length / RATE).toFixed(2)} s, ${features.length} feature frames`);
