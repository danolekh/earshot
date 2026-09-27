/* What a take does in the call debugger: pick a finding, fold a panel, play the moment it's about,
 * each measured on the page when the take gets there. A beat is one finding shown with its caption
 * and its sound; the main film and every company cut are built from the same beats. */
import { readFileSync } from "node:fs";

import type { Film } from "./film.ts";

const TRACES = new URL("../../debugger/src/calls/", import.meta.url).pathname;

export interface FindingRef {
  id: string;
  type: string;
  start: number;
  end: number;
  turnId?: string;
}

const traces = new Map<string, { findings: FindingRef[]; call: { title: string; provider?: string } }>();
export function trace(callId: string) {
  let t = traces.get(callId);
  if (!t) traces.set(callId, (t = JSON.parse(readFileSync(`${TRACES}${callId}.trace.json`, "utf8"))));
  return t!;
}

/** The first finding of `type` in a call; throws if the call has none (a take can't show it). */
export function finding(callId: string, type: string): FindingRef {
  const f = trace(callId).findings.find((x) => x.type === type);
  if (!f) throw new Error(`${callId} has no ${type} finding`);
  return f;
}

/** A link that opens the call at a finding, as the debugger's own links do (0.3 s lead-in). */
export function deepLink(callId: string, f: FindingRef): string {
  const t = Math.max(0, Math.round((f.start - 0.3) * 100) / 100);
  return `https://debugger.danolekh.com/call/${callId}/?finding=${encodeURIComponent(f.id)}${f.turnId ? `&turn=${f.turnId}` : ""}&t=${t}`;
}

const STACK: Record<string, string> = {
  livekit: "LiveKit",
  pipecat: "Pipecat",
  elevenlabs: "ElevenLabs Agents",
};
export const stackOf = (callId: string): string => STACK[trace(callId).call.provider ?? ""] ?? "LiveKit";

/** Picks a finding from the inspector's list, the way a person would. */
export async function pick(film: Film, callId: string, type: string, ms = 650): Promise<FindingRef> {
  const f = finding(callId, type);
  const item = `#inspector [data-finding="${f.id}"]`;
  await film.page.locator(item).scrollIntoViewIfNeeded();
  await film.moveTo(item, ms, [0.35, 0.5]);
  await film.click();
  await film.hold(250);
  return f;
}

/** Folds or unfolds one of the inspector's sections by its heading ("Findings", "Details"). */
export async function toggleSection(film: Film, name: string): Promise<void> {
  await film.moveTo(`#inspector [data-slot=accordion-trigger]:has-text("${name}")`, 550, [0.15, 0.5]);
  await film.click();
  await film.hold(350);
}

/** One finding, told: its caption, then the stretch of the call around it with the sound on. */
export interface Beat {
  caption: string;
  /** Seconds before and after the finding's start to play. */
  play: [number, number];
  /** How long to stay on it after playing (ms). */
  after: number;
}

export const BEATS: Record<string, Beat> = {
  early_endpoint: { caption: "The turn ended mid-number", play: [2.2, 2.0], after: 1600 },
  talk_over: { caption: "Both sides at once", play: [1.2, 1.6], after: 1200 },
  heard_vs_said: { caption: "What it heard, against what was said", play: [0.2, 2.6], after: 1800 },
  low_asr_confidence: { caption: "The recogniser wasn't sure", play: [0.6, 1.4], after: 1400 },
  tool_error: { caption: "So the lookup failed", play: [0.4, 1.2], after: 1800 },
  repeat: { caption: "It asked again", play: [0.2, 2.4], after: 1200 },
  dead_air: { caption: "Dead air, tied to the slow tool", play: [0.6, 2.4], after: 1600 },
  slow_turn: { caption: "Where the caller's wait went", play: [2.6, 0.8], after: 2200 },
  slow_tool: { caption: "The tool that took 1.9 s", play: [0.4, 1.2], after: 1600 },
  false_interruption: { caption: "It stopped for a backchannel", play: [1.4, 1.8], after: 1600 },
  agent_did_not_stop: { caption: "It talked over the caller", play: [1.2, 1.8], after: 1600 },
  disclosure_missing: { caption: "It never said it was an AI", play: [0, 3], after: 1400 },
};

/** Picks a finding and tells it. */
export async function beat(film: Film, callId: string, type: string, caption?: string): Promise<void> {
  const b = BEATS[type];
  if (!b) throw new Error(`no beat for ${type}`);
  const f = await pick(film, callId, type);
  await film.caption(caption ?? b.caption);
  await film.hold(500);
  await film.play(Math.max(0, f.start - b.play[0]), f.start + b.play[1]);
  await film.hold(b.after);
}
