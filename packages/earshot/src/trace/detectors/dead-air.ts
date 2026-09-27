import type { Detector } from "./config";
import { finding, secs, speechOf, union } from "./util";

/** Nobody speaking for too long in the middle of a call (the start and the end don't count). */
export const deadAir: Detector = {
  id: "dead_air",
  version: 1,
  scope: "call",
  run(trace, config) {
    const { silence } = config.deadAir;
    const speech = union([...speechOf(trace, "caller"), ...speechOf(trace, "agent")]);
    const out = [];
    for (let i = 1; i < speech.length; i++) {
      const start = speech[i - 1]!.end;
      const end = speech[i]!.start;
      if (end - start <= silence) continue;
      // The turn speech resumes in: the one under way when the sound comes back (a soft onset can
      // start a little before the recording shows speech), else the next to start.
      const next =
        trace.turns
          .filter((t) => t.start <= end + 0.3 && t.end >= end)
          .sort((a, b) => Math.abs(a.start - end) - Math.abs(b.start - end))[0] ??
        trace.turns.find((t) => t.start >= end - 0.05);
      out.push(
        finding(this, start.toFixed(2), {
          start,
          end,
          severity: end - start > 2 * silence ? "error" : "warning",
          ...(next && { turnId: next.id }),
          message: `${secs(end - start)} of silence on the line`,
          evidence: next ? [next.id] : [],
          measured: { silence: end - start, threshold: silence },
        }),
      );
    }
    return out;
  },
};
