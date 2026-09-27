/* Copies the demo calls (calls/out/<id>, made by `node calls/debugger.ts`) into the app: each
 * recording to public/calls/<id>, each trace to src/calls, and a summary of every call to
 * src/calls/index.json for the call list. The copies are committed, so building the app needs no
 * voices or aligner. `--index` only sums up the calls already copied. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { summarizeCall } from "@danolekh/earshot/review";
import type { CallTrace } from "@danolekh/earshot/trace";

import { callId, CALLS } from "../../../calls/scenarios/index.ts";

const out = new URL("../../../calls/out/", import.meta.url).pathname;
const data = new URL("../src/calls/", import.meta.url).pathname;
mkdirSync(data, { recursive: true });

// `--index`: only the list's summaries, again, from the traces already here (after a change to
// what a summary holds), without copying anything from calls/out.
const indexOnly = process.argv.includes("--index");

const summaries = CALLS.map((c) => {
  const id = callId(c);
  if (indexOnly)
    return summarizeCall(JSON.parse(readFileSync(`${data}${id}.trace.json`, "utf8")) as CallTrace);
  const from = `${out}${id}/`;
  const audio = new URL(`../public/calls/${id}/`, import.meta.url).pathname;
  mkdirSync(audio, { recursive: true });
  // Whichever the stack keeps: both formats, or one mixed MP3.
  for (const f of ["call.ogg", "call.mp3"]) if (existsSync(from + f)) copyFileSync(from + f, audio + f);
  copyFileSync(`${from}trace.json`, `${data}${id}.trace.json`);
  const trace = JSON.parse(readFileSync(`${from}trace.json`, "utf8")) as CallTrace;
  return summarizeCall(trace);
});
writeFileSync(`${data}index.json`, JSON.stringify(summaries, null, 1) + "\n");
console.log(
  indexOnly
    ? `summed up ${summaries.length} calls into src/calls/index.json`
    : `copied ${summaries.length} calls into public/calls and src/calls`,
);
