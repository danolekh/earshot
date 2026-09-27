/* The detectors that flag a bad moment, and running them over a trace. */

import type { CallTrace, Finding, FindingType } from "../types";
import { agentDidNotStop } from "./agent-did-not-stop";
import { DEFAULT_DETECTOR_CONFIG, type Detector, type DetectorConfig } from "./config";
import { deadAir } from "./dead-air";
import { disclosureMissing } from "./disclosure-missing";
import { earlyEndpoint } from "./early-endpoint";
import { falseInterruption } from "./false-interruption";
import { heardVsSaid } from "./heard-vs-said";
import { lowAsrConfidence } from "./low-asr-confidence";
import { repeat } from "./repeat";
import { slowTool } from "./slow-tool";
import { slowTurn } from "./slow-turn";
import { talkOver } from "./talk-over";
import { toolError } from "./tool-error";

export { DEFAULT_DETECTOR_CONFIG, type Detector, type DetectorConfig } from "./config";

export const DETECTORS: readonly Detector[] = [
  slowTurn,
  deadAir,
  talkOver,
  agentDidNotStop,
  falseInterruption,
  earlyEndpoint,
  lowAsrConfidence,
  heardVsSaid,
  toolError,
  slowTool,
  repeat,
  disclosureMissing,
];

export interface DetectOptions {
  /** Thresholds to change; the rest stay at their defaults. */
  config?: { [K in keyof DetectorConfig]?: Partial<DetectorConfig[K]> };
  /** Run only these. */
  only?: readonly FindingType[];
}

function merge(overrides: DetectOptions["config"] = {}): DetectorConfig {
  const out: Record<string, unknown> = { ...DEFAULT_DETECTOR_CONFIG };
  for (const [key, value] of Object.entries(overrides)) {
    const base = DEFAULT_DETECTOR_CONFIG[key as keyof DetectorConfig];
    out[key] = Array.isArray(base) ? value : { ...(base as object), ...(value as object) };
  }
  return out as unknown as DetectorConfig;
}

/** Every detector's findings over a trace, in time order. Findings from people (`human_feedback`)
 * already on the trace are kept. */
export function runDetectors(trace: CallTrace, options: DetectOptions = {}): Finding[] {
  const config = merge(options.config);
  const run = DETECTORS.filter((d) => !options.only || options.only.includes(d.id));
  return [
    ...trace.findings.filter((f) => f.type === "human_feedback"),
    ...run.flatMap((d) => d.run(trace, config)),
  ].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/** What the detectors can't look at in this trace, and why: the stack didn't record it. A finding
 * type that's here can't be told apart from one that didn't happen. */
export function blindSpots(trace: CallTrace): Partial<Record<FindingType, string>> {
  return Object.fromEntries(
    DETECTORS.flatMap((d) => {
      const why = d.needs?.(trace);
      return why === undefined ? [] : [[d.id, why]];
    }),
  );
}

/** The trace with its findings worked out afresh. */
export function detect(trace: CallTrace, options: DetectOptions = {}): CallTrace {
  return { ...trace, findings: runDetectors(trace, options) };
}
