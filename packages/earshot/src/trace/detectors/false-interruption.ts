import { normalizeToken } from "../diff";
import type { Detector } from "./config";
import { finding } from "./util";

/** The agent stopping for nothing: a false interruption the framework reported (noise, a cough),
 * or an interruption by a caller turn that was only a backchannel ("mhm", "ja"). */
export const falseInterruption: Detector = {
  id: "false_interruption",
  version: 1,
  run(trace, config) {
    const backchannels = new Set(config.backchannels.map(normalizeToken));
    const out = trace.signals
      .filter((s) => s.type === "false_interruption")
      .map((s) =>
        finding(this, s.at.toFixed(2), {
          start: s.at,
          end: s.end ?? s.at,
          severity: "warning",
          ...(s.turnId !== undefined && { turnId: s.turnId }),
          message: "The agent stopped for a sound that wasn't speech",
          evidence: [s.id],
        }),
      );
    for (const s of trace.signals) {
      if (s.type !== "interruption" || s.data.decision !== "stop") continue;
      const by = trace.turns.find((t) => t.channel === "caller" && t.start <= s.at + 0.05 && t.end >= s.at);
      const words = by?.text.split(/\s+/).map(normalizeToken).filter(Boolean) ?? [];
      if (!by || words.length === 0 || words.length > 2 || !words.every((w) => backchannels.has(w))) continue;
      out.push(
        finding(this, s.at.toFixed(2), {
          start: s.at,
          end: by.end,
          severity: "warning",
          ...(s.turnId !== undefined && { turnId: s.turnId }),
          message: `The agent stopped for a backchannel ("${by.text}")`,
          evidence: [s.id, by.id],
        }),
      );
    }
    return out;
  },
};
