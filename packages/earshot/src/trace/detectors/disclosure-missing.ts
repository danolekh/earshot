import { sentences } from "../similarity";
import type { Detector } from "./config";
import { finding } from "./util";

/** The agent not saying it's an AI early enough (EU AI Act, Art. 50: at the latest at the first
 * interaction). Looks at the first few sentences the caller heard, in the call's language. */
export const disclosureMissing: Detector = {
  id: "disclosure_missing",
  version: 1,
  scope: "call",
  run(trace, config) {
    const { sentences: count, patterns } = config.disclosure;
    const agent = trace.turns.filter((t) => t.channel === "agent");
    const first = agent[0];
    if (!first) return [];
    const language = (trace.call.language ?? "en").slice(0, 2).toLowerCase();
    const rules = patterns[language] ?? patterns.en ?? [];
    const heard = agent.flatMap((t) => sentences(t.interrupted?.heardText ?? t.text)).slice(0, count);
    if (heard.some((s) => rules.some((r) => r.test(s)))) return [];
    return [
      finding(this, first.id, {
        start: first.start,
        end: first.end,
        severity: "error",
        turnId: first.id,
        message: `The agent didn't say it's an AI in its first ${count} sentences`,
        evidence: [first.id],
      }),
    ];
  },
};
