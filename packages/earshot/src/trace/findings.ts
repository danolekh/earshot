/* What each kind of finding is called, which kind of problem it is, what a fixed agent does
 * instead, and which evidence explains it; how bad a set of findings is. One source for every
 * view of a call (a list, an inspector, a transcript, a timeline) and for test cases. The limits
 * in the sentences are the detectors' defaults. */
import { DEFAULT_DETECTOR_CONFIG as C } from "./detectors/config";
import type { Finding, FindingType, Severity } from "./types";

/** The kind of problem, for an icon or a colour. */
export type FindingCategory = "timing" | "turn-taking" | "recognition" | "tools" | "speech" | "feedback";

export interface FindingMeta {
  /** Its name in sentence case, where there's room. */
  label: string;
  /** A short name for chips. */
  short: string;
  category: FindingCategory;
  /** What the agent should do instead, as a test case states it. */
  expect: string;
}

export const FINDING_META: Readonly<Record<FindingType, FindingMeta>> = {
  slow_turn: { label: "Slow reply", short: "Slow reply", category: "timing", expect: "Replies in time" },
  dead_air: {
    label: "Dead air",
    short: "Dead air",
    category: "timing",
    expect: `Doesn't leave the line silent for over ${C.deadAir.silence} s`,
  },
  slow_tool: {
    label: "Slow tool",
    short: "Slow tool",
    category: "timing",
    expect: `Its tools answer within ${C.slowTool.over} s`,
  },
  early_endpoint: {
    label: "Turn ended too early",
    short: "Cut off early",
    category: "turn-taking",
    expect: "Waits for the caller to finish before replying",
  },
  talk_over: {
    label: "Talk-over",
    short: "Talk-over",
    category: "turn-taking",
    expect: "Doesn't talk over the caller",
  },
  agent_did_not_stop: {
    label: "Didn't stop when interrupted",
    short: "Didn't stop",
    category: "turn-taking",
    expect: "Stops when the caller cuts in",
  },
  false_interruption: {
    label: "Stopped for a backchannel",
    short: "False stop",
    category: "turn-taking",
    expect: "Keeps talking through a backchannel",
  },
  heard_vs_said: {
    label: "Misheard words",
    short: "Misheard",
    category: "recognition",
    expect: "Hears every word the caller says",
  },
  low_asr_confidence: {
    label: "Unsure transcription",
    short: "Unsure ASR",
    category: "recognition",
    expect: "Transcribes every word with confidence",
  },
  tool_error: { label: "Tool failed", short: "Tool failed", category: "tools", expect: "Its tools succeed" },
  repeat: {
    label: "Repeated itself",
    short: "Repeated",
    category: "speech",
    expect: "Doesn't repeat itself",
  },
  disclosure_missing: {
    label: "No AI disclosure",
    short: "No AI disclosure",
    category: "speech",
    expect: "Says it's an AI in its first sentences",
  },
  human_feedback: {
    label: "Flagged by a person",
    short: "Flagged",
    category: "feedback",
    expect: "Nobody flags it",
  },
};

export const findingLabel = (type: FindingType): string =>
  FINDING_META[type]?.label ?? type.replace(/_/g, " ");
export const findingShort = (type: FindingType): string =>
  FINDING_META[type]?.short ?? type.replace(/_/g, " ");

/** The evidence that explains a finding about a turn. */
export type EvidenceKind = "latency" | "tools" | "heard" | "decisions" | "model" | "context";

/** Which evidence explains each kind of finding: what an inspector opens when one is picked. */
export const EVIDENCE_FOR: Readonly<Partial<Record<FindingType, EvidenceKind>>> = {
  slow_turn: "latency",
  dead_air: "latency",
  slow_tool: "tools",
  tool_error: "tools",
  heard_vs_said: "heard",
  low_asr_confidence: "heard",
  early_endpoint: "decisions",
  false_interruption: "decisions",
  repeat: "model",
  disclosure_missing: "model",
};

const sec = (v: number) => `${v.toFixed(2)} s`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** What a detector measured, against its limit, in words ("3.13 s wait, limit 1.50 s"). */
export function measuredText(f: Finding): string | undefined {
  const m = f.measured;
  if (!m) return undefined;
  const limit = m.threshold;
  const against = (v: string, l?: string) => (l === undefined ? v : `${v}, limit ${l}`);
  switch (f.type) {
    case "slow_turn":
      return m.gap === undefined
        ? undefined
        : against(`${sec(m.gap)} wait`, limit === undefined ? undefined : sec(limit));
    case "dead_air":
      return m.silence === undefined
        ? undefined
        : against(`${sec(m.silence)} of silence`, limit === undefined ? undefined : sec(limit));
    case "talk_over":
    case "agent_did_not_stop":
      return m.overlap === undefined
        ? undefined
        : against(`${sec(m.overlap)} of overlap`, limit === undefined ? undefined : sec(limit));
    case "slow_tool":
      return m.duration === undefined
        ? undefined
        : against(sec(m.duration), limit === undefined ? undefined : sec(limit));
    case "early_endpoint":
      return m.pause === undefined
        ? undefined
        : `the caller went on ${sec(m.pause)} after it ended${m.probability === undefined ? "" : ` (end-of-turn probability ${m.probability.toFixed(2)})`}`;
    case "low_asr_confidence":
      return m.confidence === undefined
        ? undefined
        : against(`confidence ${m.confidence.toFixed(2)}`, limit?.toFixed(2));
    case "repeat":
      return m.similarity === undefined
        ? undefined
        : against(`${pct(m.similarity)} alike`, limit === undefined ? undefined : pct(limit));
    case "heard_vs_said":
      return m.differences === undefined
        ? undefined
        : `${m.differences} ${m.differences === 1 ? "word differs" : "words differ"}`;
    default:
      return undefined;
  }
}

const RANK: Readonly<Record<Severity, number>> = { info: 0, warning: 1, error: 2 };

/** The worst of some severities (info when there are none). */
export const worstSeverity = (items: readonly { severity: Severity }[]): Severity =>
  items.reduce<Severity>((w, f) => (RANK[f.severity] > RANK[w] ? f.severity : w), "info");

/** How many findings of each severity. */
export function countBySeverity(items: readonly { severity: Severity }[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of items) out[f.severity]++;
  return out;
}

/** Findings grouped by type, in the order each type first appears: how many, the worst, and the
 * first (where to open). */
export function groupFindings<T extends { type: FindingType; severity: Severity }>(
  items: readonly T[],
): { type: FindingType; count: number; severity: Severity; first: T }[] {
  const groups = new Map<FindingType, { type: FindingType; count: number; severity: Severity; first: T }>();
  for (const f of items) {
    const g = groups.get(f.type);
    if (g) {
      g.count++;
      if (RANK[f.severity] > RANK[g.severity]) g.severity = f.severity;
    } else groups.set(f.type, { type: f.type, count: 1, severity: f.severity, first: f });
  }
  return [...groups.values()];
}
