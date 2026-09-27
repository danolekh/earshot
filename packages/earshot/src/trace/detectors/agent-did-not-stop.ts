import type { Detector } from "./config";
import { finding, intersect, monoOnly, secs, speechOf } from "./util";

/** The caller talking over the agent, and the agent carrying on regardless. */
export const agentDidNotStop: Detector = {
  id: "agent_did_not_stop",
  version: 1,
  needs: monoOnly,
  run(trace, config) {
    const { after } = config.agentDidNotStop;
    const agent = speechOf(trace, "agent");
    return trace.turns
      .filter((t) => t.channel === "caller")
      .flatMap((caller) => {
        // Overlap that begins with the caller coming in while the agent is already speaking.
        const o = intersect([{ start: caller.start, end: caller.end }], agent).find(
          (x) => Math.abs(x.start - caller.start) < 0.05,
        );
        if (!o || o.end - o.start <= after) return [];
        const turn = trace.turns.find((t) => t.channel === "agent" && t.start < o.start && t.end > o.start);
        return [
          finding(this, caller.id, {
            ...o,
            severity: "error",
            ...(turn && { turnId: turn.id }),
            message: `The agent kept talking ${secs(o.end - o.start)} after the caller came in`,
            evidence: [caller.id, ...(turn ? [turn.id] : [])],
            measured: { overlap: o.end - o.start, threshold: after },
          }),
        ];
      });
  },
};
