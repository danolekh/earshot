/* The demo call as Pipecat kept it (spans, its observers' events, a stereo recording): the same
 * findings as LiveKit's, but one. Pipecat's traces carry the transcript, not the recogniser's
 * confidence per word, so "acht" (0.41) can't be flagged; a check on it can't be made. */
import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 1: the turn detector let go mid-number (its user_turn_stopped event), and the reply
  // talked over the rest (both channels of the recording).
  { type: "early_endpoint", line: "dictate-1", severity: "error" },
  { type: "talk_over", line: "noted", severity: "warning" },
  // Moment 2: "null" not heard (the transcript against what was said), the lookup fails (the
  // function-call observer), the question comes again.
  { type: "heard_vs_said", line: "repeat-id", severity: "error" },
  { type: "tool_error", line: "not-found", severity: "error" },
  { type: "repeat", line: "not-found", severity: "warning" },
  // Moment 3: the same silence, slow save and talk-over.
  { type: "dead_air", line: "hello", severity: "warning" },
  { type: "slow_turn", line: "saved", severity: "error" },
  { type: "slow_tool", line: "saved", severity: "warning" },
  { type: "talk_over", line: "saved", severity: "warning" },
];
