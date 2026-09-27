/* What explains a turn, in the order to show it: an agent turn by its wait, its tool calls, what the
 * model was given and what it ran on; a caller turn by what was heard against what was said and by
 * the turn detector's decisions. Evidence the stack didn't record says so (from `blindSpots`), so
 * its absence isn't read as nothing wrong. And which piece to open: the one explaining the picked
 * finding, else the turn's first finding's, else the usual one. */
import { blindSpots } from "./detectors";
import { heardDiff } from "./diff";
import { EVIDENCE_FOR, type EvidenceKind } from "./findings";
import { latencyBreakdown } from "./latency";
import { modelInput } from "./model-input";
import { decisionsOf, toolsOf, turnById } from "./trace";
import type { CallTrace, FindingType } from "./types";

export interface EvidencePart {
  kind: EvidenceKind;
  /** Why the stack has nothing for it, when that's so. */
  missing?: string;
}

export interface TurnEvidence {
  parts: readonly EvidencePart[];
  /** The part to open first. */
  open: EvidenceKind | undefined;
}

/** Evidence a caller turn's part stands for, when the stack didn't record it. */
const BLIND_FOR: Readonly<Partial<Record<EvidenceKind, FindingType>>> = {
  heard: "heard_vs_said",
  decisions: "early_endpoint",
};

export function turnEvidence(
  trace: CallTrace,
  turnId: string,
  findingId?: string,
  spots: Partial<Record<FindingType, string>> = blindSpots(trace),
): TurnEvidence {
  const turn = turnById(trace, turnId);
  if (!turn) return { parts: [], open: undefined };
  const parts: EvidencePart[] = [];
  const agent = turn.channel === "agent";
  if (agent) {
    if (latencyBreakdown(trace, turnId)) parts.push({ kind: "latency" });
    if (toolsOf(trace, turnId).length) parts.push({ kind: "tools" });
    if (modelInput(trace, turnId)) parts.push({ kind: "model" });
    if (turn.context) parts.push({ kind: "context" });
  } else {
    const had = (kind: EvidenceKind, has: boolean) => {
      const blind = BLIND_FOR[kind];
      if (has) parts.push({ kind });
      else if (blind && spots[blind]) parts.push({ kind, missing: spots[blind] });
    };
    had("heard", heardDiff(trace, turnId) !== undefined);
    had("decisions", decisionsOf(trace, turnId).length > 0);
  }
  const picked = findingId ? trace.findings.find((f) => f.id === findingId) : undefined;
  const wanted =
    (picked && EVIDENCE_FOR[picked.type]) ??
    trace.findings
      .filter((f) => f.turnId === turnId)
      .map((f) => EVIDENCE_FOR[f.type])
      .find(Boolean) ??
    (agent ? "latency" : "heard");
  return { parts, open: parts.some((p) => p.kind === wanted) ? wanted : parts[0]?.kind };
}
