import type { Detector } from "./config";
import { finding, round } from "./util";

/** Words the recogniser was unsure of, one finding per caller turn (or the turn as a whole, when
 * only it has a confidence). */
export const lowAsrConfidence: Detector = {
  id: "low_asr_confidence",
  version: 1,
  needs: (trace) =>
    trace.words.some((w) => w.source === "streaming_asr" && !w.estimated && w.confidence !== undefined) ||
    trace.turns.some((t) => t.channel === "caller" && t.confidence !== undefined)
      ? undefined
      : "no confidence from the recogniser",
  run(trace, config) {
    const { below } = config.lowAsrConfidence;
    return trace.turns
      .filter((t) => t.channel === "caller")
      .flatMap((turn) => {
        const heard = trace.words.filter((w) => w.turnId === turn.id && w.source === "streaming_asr");
        const low = heard.filter((w) => w.confidence !== undefined && w.confidence < below);
        if (low.length) {
          const lowest = Math.min(...low.map((w) => w.confidence!));
          return [
            finding(this, turn.id, {
              start: low[0]!.start,
              end: low.at(-1)!.end,
              severity: "warning",
              turnId: turn.id,
              message: `The recogniser was unsure of ${low.map((w) => `"${w.text}" (${round(w.confidence!, 2)})`).join(", ")}`,
              evidence: [turn.id, ...low.map((w) => w.id)],
              measured: { confidence: lowest, threshold: below },
            }),
          ];
        }
        const hasWordConfidence = heard.some((w) => w.confidence !== undefined);
        if (hasWordConfidence || turn.confidence === undefined || turn.confidence >= below) return [];
        return [
          finding(this, turn.id, {
            start: turn.start,
            end: turn.end,
            severity: "warning",
            turnId: turn.id,
            message: `The recogniser was unsure of this turn (${round(turn.confidence, 2)})`,
            evidence: [turn.id],
            measured: { confidence: turn.confidence, threshold: below },
          }),
        ];
      });
  },
};
