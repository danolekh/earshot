import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // Moment 1: the greeting never says it's an AI.
  { type: "disclosure_missing", line: "greeting", severity: "error" },
  // Moment 2: the calendar takes 2.4 s; three seconds of nothing.
  { type: "slow_turn", line: "booked", severity: "error" },
  { type: "slow_tool", line: "booked", severity: "error" },
  { type: "dead_air", line: "booked", severity: "warning" },
];
