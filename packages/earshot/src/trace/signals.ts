/* Turn-taking signals in words: one wording wherever a decision or an interruption is shown (a
 * timeline marker's title, an inspector's list, a gist). */
import type { SignalType, TraceSignal } from "./types";

const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/** The signals that are about who has the turn: the turn detector's decisions, interruptions,
 * false ones, and backchannels. */
export const TURN_TAKING_SIGNALS: ReadonlySet<SignalType> = new Set<SignalType>([
  "eou_decision",
  "interruption",
  "false_interruption",
  "backchannel",
]);

/** A signal as a sentence: "End of turn committed after 350 ms, p = 0.91", "Interruption: stop
 * after 300 ms". */
export function describeSignal(s: TraceSignal): string {
  switch (s.type) {
    case "eou_decision":
      return `End of turn ${s.data.outcome.replace(/_/g, " ")} after ${ms(s.data.wait)}${
        s.data.probability !== undefined ? `, p = ${s.data.probability.toFixed(2)}` : ""
      }`;
    case "interruption":
      return `Interruption: ${s.data.decision}${s.data.stopAfter !== undefined ? ` after ${ms(s.data.stopAfter)}` : ""}`;
    default:
      return s.type.replace(/_/g, " ");
  }
}
