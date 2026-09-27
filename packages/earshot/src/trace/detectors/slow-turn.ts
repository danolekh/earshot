import { latencyBreakdown } from "../latency";
import type { Detector } from "./config";
import { finding, secs } from "./util";

/** A reply the caller waited too long for, measured from the end of their speech on the recording
 * to the agent's first sound, with the stages that explain it as evidence. */
export const slowTurn: Detector = {
  id: "slow_turn",
  version: 1,
  run(trace, config) {
    const { gap } = config.slowTurn;
    return trace.turns.flatMap((turn) => {
      const b = latencyBreakdown(trace, turn.id);
      if (!b || b.measured <= gap) return [];
      const slowest = [...b.stages].sort((x, y) => y.end - y.start - (x.end - x.start))[0];
      return [
        finding(this, turn.id, {
          start: b.anchor,
          end: b.start,
          severity: b.measured > 2 * gap ? "error" : "warning",
          turnId: turn.id,
          message:
            `The caller waited ${secs(b.measured)} for a reply` +
            (slowest
              ? `; the longest stage was ${slowest.label} (${secs(slowest.end - slowest.start)})`
              : ""),
          evidence: [b.replyTo, turn.id, ...b.stages.flatMap((s) => (s.spanId ? [s.spanId] : []))],
          measured: {
            gap: b.measured,
            threshold: gap,
            unexplained: b.unexplained,
            ...(b.reported !== undefined && { reported: b.reported }),
          },
        }),
      ];
    });
  },
};
