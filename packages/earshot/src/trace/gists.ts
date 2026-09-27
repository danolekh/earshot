/* Each piece of evidence about a turn in one line, for a heading that says the gist before it's
 * opened: "Waited 3.13 s · 460 ms unexplained", "1 word missed · 1 unsure". English, like the
 * detectors' own sentences. */
import { DEFAULT_DETECTOR_CONFIG } from "./detectors/config";
import type { HeardDiff } from "./diff";
import { type LatencyBreakdown, UNEXPLAINED_MIN } from "./latency";
import type { ModelInput } from "./model-input";
import type { EouDecisionSignal, TraceSpan, TurnContext } from "./types";

const ms = (s: number) => `${Math.round(s * 1000)} ms`;
const secs = (s: number) => `${s.toFixed(2)} s`;
const failed = (s: TraceSpan) => s.status?.code === "error" || s.tool?.isError === true;

export const latencyGist = (b: LatencyBreakdown): string =>
  `Waited ${secs(b.measured)}${b.unexplained >= UNEXPLAINED_MIN ? ` · ${ms(b.unexplained)} unexplained` : ""}`;

/** Words missed, and heard with a confidence under `below` (the low-confidence detector's). */
export function heardGist(
  d: HeardDiff,
  below: number = DEFAULT_DETECTOR_CONFIG.lowAsrConfidence.below,
): string {
  const missed = d.ops.filter((o) => o.op !== "same" && o.said).length;
  const unsure = d.ops.filter((o) => o.heard?.confidence !== undefined && o.heard.confidence < below).length;
  return [
    missed ? `${missed} ${missed === 1 ? "word" : "words"} missed` : "Every word heard",
    ...(unsure ? [`${unsure} unsure`] : []),
  ].join(" · ");
}

/** The last decision: "committed after 350 ms · p 0.91". */
export function decisionsGist(decisions: readonly EouDecisionSignal[]): string {
  const last = decisions.at(-1);
  if (!last) return "";
  const p = last.data.probability;
  return `${last.data.outcome.replace(/_/g, " ")} after ${ms(last.data.wait)}${p === undefined ? "" : ` · p ${p.toFixed(2)}`}`;
}

/** One call: "crm.lookup · 320 ms · failed"; several: "3 tools · 1 failed". */
export function toolsGist(spans: readonly TraceSpan[]): string {
  const bad = spans.filter(failed).length;
  if (spans.length === 1) {
    const s = spans[0]!;
    return `${s.tool?.name ?? s.name} · ${ms(s.end - s.start)}${bad ? " · failed" : ""}`;
  }
  return `${spans.length} tools${bad ? ` · ${bad} failed` : ""}`;
}

export const modelGist = (m: ModelInput): string =>
  `${m.messages.length} messages, ${Math.max(0, m.messages.length - m.before)} new`;

export const contextGist = (context: TurnContext): string =>
  [context.model, context.promptVersion].filter(Boolean).join(" · ");
