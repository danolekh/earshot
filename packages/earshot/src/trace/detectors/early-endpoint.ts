import { speechEnd } from "../latency";
import { replyOf } from "../trace";
import type { Detector } from "./config";
import { finding, isCritical, isNumberWord, secs } from "./util";

/** The turn detector ending the caller's turn while they were only pausing: the caller carries on
 * within a moment, while the agent's reply is on its way or already playing. Worst mid-number. */
export const earlyEndpoint: Detector = {
  id: "early_endpoint",
  version: 1,
  needs: (trace) =>
    trace.signals.some((s) => s.type === "eou_decision") ? undefined : "no end-of-turn decisions",
  run(trace, config) {
    const { resumeWithin } = config.earlyEndpoint;
    const callers = trace.turns.filter((t) => t.channel === "caller");
    return trace.signals.flatMap((s) => {
      if (s.type !== "eou_decision" || s.data.outcome !== "committed" || !s.turnId) return [];
      const i = callers.findIndex((t) => t.id === s.turnId);
      const turn = callers[i];
      const next = callers[i + 1];
      if (!turn || !next) return [];
      const ended = speechEnd(trace, turn);
      const pause = next.start - ended;
      const reply = replyOf(trace, turn.id);
      if (pause > resumeWithin || (reply && next.start >= reply.end)) return [];
      const words = trace.words.filter(
        (w) => (w.turnId === turn.id || w.turnId === next.id) && w.channel === "caller",
      );
      const critical =
        words.some(isCritical) || [turn.text, next.text].some((t) => t.split(/\s+/).some(isNumberWord));
      return [
        finding(this, turn.id, {
          start: ended,
          end: next.end,
          severity: critical ? "error" : "warning",
          turnId: turn.id,
          message:
            `The turn was ended after a ${secs(pause)} pause, but the caller went on ("${next.text}")` +
            (critical ? " in the middle of a number" : ""),
          evidence: [s.id, turn.id, next.id, ...(reply ? [reply.id] : [])],
          measured: {
            pause,
            threshold: resumeWithin,
            wait: s.data.wait,
            ...(s.data.probability !== undefined && { probability: s.data.probability }),
          },
        }),
      ];
    });
  },
};
