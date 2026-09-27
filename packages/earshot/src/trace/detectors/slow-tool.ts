import type { Detector } from "./config";
import { finding, secs } from "./util";

/** A tool call the caller waited through. */
export const slowTool: Detector = {
  id: "slow_tool",
  version: 1,
  run(trace, config) {
    const { over } = config.slowTool;
    return trace.spans
      .filter((s) => s.kind === "tool" && s.end - s.start > over)
      .map((s) =>
        finding(this, s.id, {
          start: s.start,
          end: s.end,
          severity: s.end - s.start > 2 * over ? "error" : "warning",
          ...(s.turnId !== undefined && { turnId: s.turnId }),
          message: `${s.tool?.name ?? s.name} took ${secs(s.end - s.start)}`,
          evidence: [s.id],
          measured: { duration: s.end - s.start, threshold: over },
        }),
      );
  },
};
