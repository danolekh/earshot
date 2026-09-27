/* Copies the built demo calls (calls/out, made by `node calls/build.ts`) into the docs: the audio to
 * public/calls, the conversation JSON to src/calls where the demos import it, and the inspector's
 * trace. The copies are committed, so building the docs needs no voices or whisper. */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

const from = new URL("../../../calls/out/", import.meta.url).pathname;
const audio = new URL("../public/calls/", import.meta.url).pathname;
const data = new URL("../src/calls/", import.meta.url).pathname;
mkdirSync(audio, { recursive: true });
mkdirSync(data, { recursive: true });
for (const f of readdirSync(from)) {
  if (f.endsWith(".mp3")) copyFileSync(from + f, audio + f);
  if (f.endsWith(".json")) copyFileSync(from + f, data + f);
}
// The inspector's demo: one debugger call, as a trace with its recording.
const traced = "stadtwerke-zaehlerstand";
copyFileSync(`${from}${traced}/trace.json`, `${data}${traced}.trace.json`);
copyFileSync(`${from}${traced}/call.mp3`, `${audio}${traced}.mp3`);
console.log("copied the calls into public/calls and src/calls");
