/* Where each detector draws the line. Seconds unless noted. The defaults come from published
 * practice (a reply over 1.5 s feels slow, silence over 2 s reads as a dead line, recognisers'
 * confidence under 0.6 is worth a look) and are meant to be tuned per flow and language. */

import type { CallTrace, Finding, FindingType } from "../types";

export interface DetectorConfig {
  /** A reply slower than `gap`, from the end of the caller's speech to the agent's first sound. */
  slowTurn: { gap: number };
  /** Nobody speaking for longer than `silence`, not counting before the first word or after the
   * last. */
  deadAir: { silence: number };
  /** Both sides speaking at once for longer than `overlap`. */
  talkOver: { overlap: number };
  /** The agent still talking `after` seconds into the caller talking over it. */
  agentDidNotStop: { after: number };
  /** The caller carrying on within `resumeWithin` of the agent deciding their turn was over. */
  earlyEndpoint: { resumeWithin: number };
  /** Words the recogniser gave less than `below` confidence (0..1). */
  lowAsrConfidence: { below: number };
  /** A tool call longer than `over`. */
  slowTool: { over: number };
  /** An agent sentence at least `similarity` (0..1) like one it said in the last `within`
   * seconds; sentences shorter than `minWords` don't count ("Danke."). */
  repeat: { similarity: number; within: number; minWords: number };
  /** The agent saying it's an AI within its first `sentences` sentences, matched per language. */
  disclosure: { sentences: number; patterns: Readonly<Record<string, readonly RegExp[]>> };
  /** Short acknowledgements that shouldn't stop the agent. */
  backchannels: readonly string[];
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  slowTurn: { gap: 1.5 },
  deadAir: { silence: 2 },
  talkOver: { overlap: 0.3 },
  agentDidNotStop: { after: 1 },
  earlyEndpoint: { resumeWithin: 1 },
  lowAsrConfidence: { below: 0.6 },
  slowTool: { over: 1 },
  repeat: { similarity: 0.8, within: 60, minWords: 4 },
  disclosure: {
    sentences: 4,
    patterns: {
      de: [/\bKI\b/, /künstliche[nr]? Intelligenz/i, /(digitale|virtuelle)[nr]? Assistent/i, /\bBot\b/i],
      en: [/\bAI\b/, /artificial intelligence/i, /(virtual|automated|digital) assistant/i, /\bbot\b/i],
    },
  },
  backchannels: [
    "ja",
    "mhm",
    "mhmm",
    "hm",
    "aha",
    "genau",
    "okay",
    "ok",
    "gut",
    "yes",
    "yeah",
    "uh-huh",
    "right",
  ],
};

/** One rule over a trace. `version` goes up whenever what it flags changes, so a stored finding
 * says which rule made it. */
export interface Detector {
  id: FindingType;
  version: number;
  /** "call" for a property of the whole call (dead air, a missing disclosure) rather than of the
   * turn a finding is pinned to; a check drafted from it looks across the call. */
  scope?: "call";
  /** Why it can't look at this trace, when the stack didn't record what it needs ("no end-of-turn
   * decisions"). It finds nothing there, and that means nothing: a check on it can't be made. */
  needs?(trace: CallTrace): string | undefined;
  run(trace: CallTrace, config: DetectorConfig): Finding[];
}
