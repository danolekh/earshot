/* What the detectors must find in the demo call: exactly these, on these lines, and nothing else.
 * A finding's line is the turn it's attached to. */
import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 1: the turn ended mid-number, and the agent talked over the rest.
  { type: "early_endpoint", line: "dictate-1", severity: "error" },
  { type: "talk_over", line: "noted", severity: "warning" },
  // Moment 2: "null" not heard, "acht" unsure, the lookup fails, the question comes again.
  { type: "low_asr_confidence", line: "repeat-id", severity: "warning" },
  { type: "heard_vs_said", line: "repeat-id", severity: "error" },
  { type: "tool_error", line: "not-found", severity: "error" },
  { type: "repeat", line: "not-found", severity: "warning" },
  // Moment 3: 3.1 s of nothing, a slow save, "Hallo?" into the silence, then talked over.
  { type: "dead_air", line: "hello", severity: "warning" },
  { type: "slow_turn", line: "saved", severity: "error" },
  { type: "slow_tool", line: "saved", severity: "warning" },
  { type: "talk_over", line: "saved", severity: "warning" },
];
