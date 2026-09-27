/* Drafting a test case from a bad moment: the exchange it happened in (the caller's turn and the
 * agent's reply), what the agent ran on, and one check per finding there, stating what the agent
 * should have done instead. The inverse of running one (checks.ts): on the call it's drafted from,
 * a good test fails. And what a run comes to, and each check as a sentence. */
import { formatTime } from "../core/conversation";
import {
  type Anchor,
  anchorMatches,
  type Check,
  type CheckResult,
  type CheckStatus,
  saidText,
  type TestCase,
} from "./checks";
import { DETECTORS } from "./detectors";
import { DEFAULT_DETECTOR_CONFIG } from "./detectors/config";
import { FINDING_META, findingLabel } from "./findings";
import { modelInput } from "./model-input";
import type { CallTrace, Finding, TraceTurn } from "./types";

const turnById = (trace: CallTrace, id: string | undefined) =>
  id === undefined ? undefined : trace.turns.find((t) => t.id === id);

/** Findings about the whole call rather than a turn: their checks look across the whole call. */
const CALL_WIDE = new Set(DETECTORS.filter((d) => d.scope === "call").map((d) => d.id));

/** How a check about `turn` finds it on another call: what the caller said there, and whether
 * it's about the agent's reply to it. */
export function anchorFor(trace: CallTrace, turn: TraceTurn): Anchor | undefined {
  const caller = turn.channel === "caller" ? turn : turnById(trace, turn.replyTo);
  if (!caller) return undefined;
  const said = saidText(trace, caller);
  // Which of the turns like it this is, so a call that says it again still finds this one.
  const nth = Math.max(
    0,
    anchorMatches(trace, said).findIndex((m) => m.turn.id === caller.id),
  );
  return { said, ...(turn.channel === "agent" && { reply: true }), nth };
}

/** A check's scope: a turn, with its anchor, or the whole call. */
const scopeOf = (trace: CallTrace, turn: TraceTurn | undefined) => {
  if (!turn) return {};
  const at = anchorFor(trace, turn);
  return { turn: turn.id, ...(at && { at }) };
};

/** The check a finding asks for: what the agent should have done instead. A slow reply asks for
 * one within the slow-reply detector's limit. */
export function checkFor(trace: CallTrace, f: Finding): Check {
  const turn = CALL_WIDE.has(f.type) ? undefined : turnById(trace, f.turnId);
  const scope = scopeOf(trace, turn);
  switch (f.type) {
    case "slow_turn":
      return { kind: "reply_within", seconds: DEFAULT_DETECTOR_CONFIG.slowTurn.gap, ...scope };
    case "heard_vs_said":
      if (turn) return { kind: "hears", text: saidText(trace, turn), ...scope };
      break;
    case "tool_error": {
      const failed = trace.spans.find(
        (s) => s.kind === "tool" && s.turnId === f.turnId && s.status?.code === "error",
      );
      if (failed) return { kind: "tool_succeeds", tool: failed.tool?.name ?? failed.name, ...scope };
      break;
    }
  }
  return { kind: "no_finding", finding: f.type, ...scope };
}

const same = (a: Check, b: Check) => JSON.stringify(a) === JSON.stringify(b);

/** A test case from a turn (and the finding picked on it): the exchange, what the agent ran on, and
 * a check per finding on those turns, the picked one first. A turn with no findings gets a check
 * worth keeping: a reply in time, or hearing what was said. */
export function draftTestCase(trace: CallTrace, turnId: string, findingId?: string): TestCase {
  const picked = turnById(trace, turnId);
  const finding = findingId ? trace.findings.find((f) => f.id === findingId) : undefined;
  const caller = picked?.channel === "caller" ? picked : turnById(trace, picked?.replyTo);
  const reply = picked?.channel === "agent" ? picked : trace.turns.find((t) => t.replyTo === picked?.id);
  const turns = [caller?.id, reply?.id, finding?.turnId].filter(
    (id, i, all): id is string => !!id && all.indexOf(id) === i,
  );
  const findings = trace.findings
    .filter((f) => f.turnId !== undefined && turns.includes(f.turnId))
    .sort((a, b) => Number(b.id === findingId) - Number(a.id === findingId) || a.start - b.start);
  const checks: Check[] = [];
  for (const f of findings) {
    const check = checkFor(trace, f);
    if (!checks.some((c) => same(c, check))) checks.push(check);
  }
  if (!checks.length) {
    if (reply)
      checks.push({
        kind: "reply_within",
        seconds: DEFAULT_DETECTOR_CONFIG.slowTurn.gap,
        ...scopeOf(trace, reply),
      });
    else if (caller) checks.push({ kind: "hears", text: saidText(trace, caller), ...scopeOf(trace, caller) });
  }
  const context = reply?.context;
  const messages = reply ? modelInput(trace, reply.id)?.messages.length : undefined;
  const at = finding?.start ?? picked?.start ?? 0;
  const what = finding
    ? findingLabel(finding.type)
    : picked?.channel === "agent"
      ? "Agent's reply"
      : "Caller's turn";
  return {
    version: 1,
    name: `${trace.call.title ?? trace.call.id} · ${what} at ${formatTime(at)}`,
    source: { callId: trace.call.id, turns, at: Math.round(at * 100) / 100 },
    context: {
      ...(context?.promptVersion && { promptVersion: context.promptVersion }),
      ...(context?.model && { model: context.model }),
      ...(messages !== undefined && { messages }),
    },
    checks,
  };
}

/** A check as a sentence: what the agent should do. */
export function describeCheck(check: Check): string {
  switch (check.kind) {
    case "no_finding":
      return FINDING_META[check.finding]?.expect ?? `No ${findingLabel(check.finding).toLowerCase()}`;
    case "reply_within":
      return `Replies within ${check.seconds} s`;
    case "hears":
      return `Hears “${check.text}”`;
    case "tool_succeeds":
      return `${check.tool} succeeds`;
  }
}

export interface RunSummary {
  /** The worst of the results: any failure fails the run; a check that couldn't run leaves it
   * incomplete. */
  status: CheckStatus;
  text: string;
}

/** What a test's results on one call come to: "2 of 4 fail", "3 of 4 pass, 1 can't check",
 * "All pass". */
export function summarizeRun(results: readonly CheckResult[]): RunSummary {
  const n = results.length;
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  const fail = count("fail");
  const missing = count("missing");
  if (fail) return { status: "fail", text: `${fail} of ${n} fail` };
  if (missing) return { status: "missing", text: `${count("pass")} of ${n} pass, ${missing} can't check` };
  return { status: "pass", text: n === 1 ? "Passes" : "All pass" };
}
