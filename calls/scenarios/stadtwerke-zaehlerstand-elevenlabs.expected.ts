/* The demo call as ElevenLabs Agents kept it (a transcript to the second, tool latencies, a mixed
 * recording), placed by a reference transcript. Two moments can't be seen: nothing records the
 * turn detector's decisions (so no early end), and one mixed channel can't say who talked over
 * whom. Nor is the recogniser's confidence kept. What it does keep, a person's dislike, is here. */
import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 2: "null" not heard, the lookup fails (is_error), the question comes again; and
  // someone disliked the reply.
  { type: "heard_vs_said", line: "repeat-id", severity: "error" },
  { type: "tool_error", line: "not-found", severity: "error" },
  { type: "repeat", line: "not-found", severity: "warning" },
  { type: "human_feedback", line: "not-found", severity: "warning" },
  // Moment 3: the silence (in the mixed recording), the slow save (tool_latency_secs).
  { type: "dead_air", line: "hello", severity: "warning" },
  { type: "slow_turn", line: "saved", severity: "error" },
  { type: "slow_tool", line: "saved", severity: "warning" },
];
