import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 1: the agent stops for "Mhm.", and has to list the slots again.
  { type: "false_interruption", line: "slots", severity: "warning" },
  { type: "repeat", line: "slots-again", severity: "warning" },
  // Moment 2: the caller cuts in and the agent reads on.
  { type: "agent_did_not_stop", line: "confirm", severity: "error" },
  { type: "talk_over", line: "confirm", severity: "warning" },
];
