import { sentences, similarity, wordCount } from "../similarity";
import type { Detector } from "./config";
import { finding, round } from "./util";

/** The agent asking or saying the same thing again: a sentence much like one from an earlier turn
 * in the last minute. Short sentences ("Danke.") don't count. */
export const repeat: Detector = {
  id: "repeat",
  version: 1,
  run(trace, config) {
    const { similarity: threshold, within, minWords } = config.repeat;
    const agent = trace.turns.filter((t) => t.channel === "agent");
    return agent.flatMap((turn, i) => {
      let best: { score: number; earlier: (typeof agent)[number]; sentence: string } | undefined;
      for (const earlier of agent.slice(0, i)) {
        if (turn.start - earlier.end > within) continue;
        for (const a of sentences(turn.text))
          for (const b of sentences(earlier.text)) {
            if (wordCount(a) < minWords || wordCount(b) < minWords) continue;
            const score = similarity(a, b);
            if (score >= threshold && (!best || score > best.score)) best = { score, earlier, sentence: a };
          }
      }
      if (!best) return [];
      return [
        finding(this, turn.id, {
          start: turn.start,
          end: turn.end,
          severity: "warning",
          turnId: turn.id,
          message: `The agent repeated itself: "${best.sentence}" (${round(best.score, 2)} like turn ${best.earlier.id})`,
          evidence: [best.earlier.id, turn.id],
          measured: { similarity: best.score, threshold },
        }),
      ];
    });
  },
};
