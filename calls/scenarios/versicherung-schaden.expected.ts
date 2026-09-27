import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 1: the surname heard at 0.38.
  { type: "low_asr_confidence", line: "name", severity: "warning" },
  // Moment 2: the turn ended mid-sentence (a warning: no number was cut), and the agent talked over
  // the rest.
  { type: "early_endpoint", line: "where-1", severity: "warning" },
  { type: "talk_over", line: "noted", severity: "warning" },
];
