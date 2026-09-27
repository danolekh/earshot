/* What a take knows about the calls it films (their findings, read from the traces) and how it
 * picks a finding in the debugger, measured on the page when the take gets there. */
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

/** Picks a finding from the inspector's list, the way a person would. */
export async function pick(film: Film, callId: string, type: string, ms = 650): Promise<FindingRef> {
  const f = finding(callId, type);
  const item = `#inspector [data-finding="${f.id}"]`;
  await film.scrollTo(item);
  await film.moveTo(item, ms, [0.35, 0.5]);
  await film.click();
  await film.hold(250);
  return f;
}
