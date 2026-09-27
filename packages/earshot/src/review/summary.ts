/* What a list of calls shows of each one, so a list never loads a whole trace: its findings, how
 * bad it was, the slowest reply, what it ran on and whether it got where it was going. */
import { latencyBreakdown } from "../trace/latency";
import type { CallTrace, FindingType, Severity } from "../trace/types";

export interface FindingSummary {
  id: string;
  type: FindingType;
  severity: Severity;
  start: number;
  message: string;
  /** The turn it's about, so a link opens with that turn picked. */
  turnId?: string;
}

export interface CallSummary {
  id: string;
  title: string;
  startedAt?: string;
  /** Seconds. */
  duration: number;
  direction?: "inbound" | "outbound";
  language?: string;
  /** The stack that recorded it (`CallMeta.provider`). */
  provider?: string;
  agent?: string;
  prompt?: string;
  /** What the call was for, and whether it got there. */
  goal?: string;
  achieved?: boolean;
  findings: readonly FindingSummary[];
  errors: number;
  warnings: number;
  /** The longest the caller waited for a reply, measured on the recording (seconds). */
  slowestReply?: number;
  turns: number;
  /** Everything said, for search. */
  text: string;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function summarizeCall(trace: CallTrace): CallSummary {
  const { call } = trace;
  const findings = [...trace.findings]
    .sort((a, b) => a.start - b.start)
    .map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      start: round(f.start),
      message: f.message,
      ...(f.turnId !== undefined && { turnId: f.turnId }),
    }));
  const waits = trace.turns
    .filter((t) => t.channel === "agent" && t.replyTo)
    .map((t) => latencyBreakdown(trace, t.id)?.measured)
    .filter((w): w is number => w !== undefined);
  const outcome = call.outcome ?? {};
  return {
    id: call.id,
    title: call.title ?? call.id,
    ...(call.startedAt !== undefined && { startedAt: call.startedAt }),
    duration: round(call.duration),
    ...(call.direction !== undefined && { direction: call.direction }),
    ...(call.language !== undefined && { language: call.language }),
    ...(call.provider !== undefined && { provider: call.provider }),
    ...(call.versions?.agent !== undefined && { agent: call.versions.agent }),
    ...(call.versions?.prompt !== undefined && { prompt: call.versions.prompt }),
    ...(typeof outcome.goal === "string" && { goal: outcome.goal }),
    ...(typeof outcome.achieved === "boolean" && { achieved: outcome.achieved }),
    findings,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    ...(waits.length > 0 && { slowestReply: round(Math.max(...waits)) }),
    turns: trace.turns.length,
    text: trace.turns.map((t) => t.text).join(" "),
  };
}
