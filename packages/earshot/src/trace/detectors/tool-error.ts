import type { Detector } from "./config";
import { finding, unknownToolResults } from "./util";

/** A tool call that failed. */
export const toolError: Detector = {
  id: "tool_error",
  version: 1,
  needs: unknownToolResults,
  run(trace) {
    return trace.spans
      .filter((s) => s.kind === "tool" && (s.status?.code === "error" || s.tool?.isError))
      .map((s) =>
        finding(this, s.id, {
          start: s.start,
          end: s.end,
          severity: "error",
          ...(s.turnId !== undefined && { turnId: s.turnId }),
          message: `${s.tool?.name ?? s.name} failed` + (s.status?.message ? `: ${s.status.message}` : ""),
          evidence: [s.id],
        }),
      );
  },
};
