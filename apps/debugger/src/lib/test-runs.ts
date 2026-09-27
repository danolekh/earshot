/* Where a saved test runs. A test runs on every call of the flow it was drafted from: the calls
 * with the same title (the same script, on each agent version and stack), oldest first. What a
 * run comes to is earshot's `summarizeRun`. */
import { type CallSummary, type Moment, momentFor } from "@danolekh/earshot/review";
import type { CallTrace, TestCase } from "@danolekh/earshot/trace";

/** The calls a test runs on: its own call's flow, oldest first. */
export function flowOf(calls: readonly CallSummary[], test: TestCase): CallSummary[] {
  const source = calls.find((c) => c.id === test.source.callId);
  if (!source) return [];
  const time = (c: CallSummary) => (c.startedAt ? Date.parse(c.startedAt) : 0);
  return calls.filter((c) => c.title === source.title).sort((a, b) => time(a) - time(b));
}

/** A call's agent version, short: "v43" from "stadtwerke-outbound v43". */
export function versionOf(call: CallSummary): string {
  const last = call.agent?.split(/\s+/).at(-1);
  return last && /^v\d/.test(last) ? last : (call.agent ?? call.id);
}

/** Where to open a call for a result: just before the turn it looked at, or at the start. */
export function momentOf(trace: CallTrace, turnId: string | undefined): Moment {
  const turn = turnId ? trace.turns.find((t) => t.id === turnId) : undefined;
  return turn ? momentFor({ start: turn.start, turn: turn.id }) : {};
}
