import type { Detector } from "./config";
import { finding, intersect, monoOnly, secs, speechOf } from "./util";

/** Both sides talking at once for longer than a backchannel. */
export const talkOver: Detector = {
  id: "talk_over",
  version: 1,
  needs: monoOnly,
  run(trace, config) {
    const { overlap } = config.talkOver;
    return intersect(speechOf(trace, "caller"), speechOf(trace, "agent"))
      .filter((o) => o.end - o.start > overlap)
      .map((o) => {
        const agent = trace.turns.find((t) => t.channel === "agent" && t.start < o.end && t.end > o.start);
        const caller = trace.turns.find((t) => t.channel === "caller" && t.start < o.end && t.end > o.start);
        return finding(this, o.start.toFixed(2), {
          ...o,
          severity: "warning",
          ...(agent && { turnId: agent.id }),
          message: `Both sides spoke at once for ${secs(o.end - o.start)}`,
          evidence: [agent?.id, caller?.id].filter((x): x is string => !!x),
          measured: { overlap: o.end - o.start, threshold: overlap },
        });
      });
  },
};
