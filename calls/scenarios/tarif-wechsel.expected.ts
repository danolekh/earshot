import type { ExpectedFinding } from "../scenario.ts";

export const expected: readonly ExpectedFinding[] = [
  // The model takes 2.75 s; 3.2 s of nothing.
  { type: "slow_turn", line: "compare", severity: "error" },
  { type: "dead_air", line: "compare", severity: "warning" },
];
