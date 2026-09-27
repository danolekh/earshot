import { diffWords } from "../diff";
import type { Detector } from "./config";
import { finding, isCritical } from "./util";

/** What the agent heard differing from what was said, where it matters: in a slot (a customer
 * number, an IBAN) or a number. Elsewhere a recogniser's slips are noise. */
export const heardVsSaid: Detector = {
  id: "heard_vs_said",
  version: 1,
  needs: (trace) =>
    trace.words.some((w) => w.source === "aligned") ? undefined : "no transcript of what was said",
  run(trace) {
    return trace.turns
      .filter((t) => t.channel === "caller")
      .flatMap((turn) => {
        const own = trace.words.filter((w) => w.turnId === turn.id);
        const heard = own.filter((w) => w.source === "streaming_asr");
        const said = own.filter((w) => w.source === "aligned");
        if (!heard.length || !said.length) return [];
        const diffs = diffWords(heard, said).filter(
          (d) => d.op !== "same" && [d.heard, d.said].some((w) => w && isCritical(w)),
        );
        if (!diffs.length) return [];
        const words = diffs.flatMap((d) => [d.said, d.heard].filter((w) => w !== undefined));
        const describe = diffs.map((d) =>
          d.op === "missing"
            ? `"${d.said!.text}" was said but not heard`
            : d.op === "extra"
              ? `"${d.heard!.text}" was heard but not said`
              : `"${d.said!.text}" was heard as "${d.heard!.text}"`,
        );
        return [
          finding(this, turn.id, {
            start: Math.min(...words.map((w) => w.start)),
            end: Math.max(...words.map((w) => w.end)),
            severity: "error",
            turnId: turn.id,
            message: `The agent heard "${heard.map((w) => w.text).join(" ")}": ${describe.join("; ")}`,
            evidence: [turn.id, ...words.map((w) => w.id)],
            measured: { differences: diffs.length },
          }),
        ];
      });
  },
};
