/* Test cases from calls: what an agent should have done at a bad moment, as checks that run on a
 * call's trace. Run on the call they were drafted from, they fail (that's the bug caught); run on
 * a later call of the same flow, they say whether it's fixed.
 *
 * A check looks at one turn, or at the whole call. On its own call the turn is named by id; on any
 * other call it's found by what the caller said there (the check's anchor): the caller turn with
 * most of those words, in order, or the agent's reply to it. */
import { DETECTORS, runDetectors } from "./detectors";
import { unknownToolResults } from "./detectors/util";
import { normalizeToken } from "./diff";
import { latencyBreakdown } from "./latency";
import type { CallTrace, FindingType, TraceTurn } from "./types";

/** Where a check looks in a call other than its own: the caller turn with these words, or (with
 * `reply`) the agent's reply to it. */
export interface Anchor {
  said: string;
  reply?: boolean;
  /** Which of the caller turns like it, in order (0: the first). A call that says it twice (a
   * number read back) keeps pointing at the same one, even where the words were heard
   * differently. Without it, the most like it. */
  nth?: number;
}

/** Where a check looks: a turn, or (with neither) the whole call. */
export interface CheckScope {
  /** The turn on the call the check was drafted from. */
  turn?: string;
  /** How to find that turn on any other call. */
  at?: Anchor;
}

/** The detector for `finding` flags nothing there. */
export interface NoFindingCheck extends CheckScope {
  kind: "no_finding";
  finding: FindingType;
}

/** The agent's reply there (or every reply) starts within `seconds` of the caller's last word. */
export interface ReplyWithinCheck extends CheckScope {
  kind: "reply_within";
  seconds: number;
}

/** Every word of `text` is among what the recogniser heard there, in order. */
export interface HearsCheck extends CheckScope {
  kind: "hears";
  text: string;
}

/** Every call of `tool` there succeeds, and there's at least one. */
export interface ToolSucceedsCheck extends CheckScope {
  kind: "tool_succeeds";
  tool: string;
}

export type Check = NoFindingCheck | ReplyWithinCheck | HearsCheck | ToolSucceedsCheck;

export interface TestCase {
  version: 1;
  name: string;
  /** Where it was drafted: the call, the turns it covers, and the moment. */
  source: { callId: string; turns: readonly string[]; at: number };
  /** What the agent ran on then. */
  context: { promptVersion?: string; model?: string; messages?: number };
  checks: readonly Check[];
}

/** Passed, failed, or couldn't run: no turn in the call is like the one it's about. */
export type CheckStatus = "pass" | "fail" | "missing";

export interface CheckResult {
  check: Check;
  status: CheckStatus;
  pass: boolean;
  /** What was measured, in words: "waited 3.13 s", "“null” not heard". */
  measured: string;
  /** The turn it looked at, when it looked at one. */
  turn?: string;
}

/** A turn counts as the anchor's when it has at least this share of the anchor's words. */
export const ANCHOR_MATCH = 0.7;

const secs = (s: number) => `${s.toFixed(2)} s`;
const tokens = (text: string) => text.split(/\s+/).map(normalizeToken).filter(Boolean);

/** How much of `anchor` `text` says: the share of its words found in `text`, in order, 0 to 1. */
export function anchorScore(anchor: string, text: string): number {
  const want = tokens(anchor);
  const have = tokens(text);
  if (!want.length) return 0;
  let at = 0;
  let found = 0;
  for (const w of want) {
    const i = have.indexOf(w, at);
    if (i === -1) continue;
    found++;
    at = i + 1;
  }
  return found / want.length;
}

/** What a caller said on a turn: the aligned words when there are any, else the turn's text. */
export function saidText(trace: CallTrace, turn: TraceTurn): string {
  const words = trace.words.filter((w) => w.turnId === turn.id && w.source === "aligned");
  return words.length ? words.map((w) => w.text).join(" ") : turn.text;
}

/** The turn an anchor points at in a call, or null when none is like it. */
/** The caller turns like an anchor's words, in order. */
export function anchorMatches(trace: CallTrace, said: string): { turn: TraceTurn; score: number }[] {
  return trace.turns
    .filter((t) => t.channel === "caller")
    .map((turn) => ({ turn, score: anchorScore(said, saidText(trace, turn)) }))
    .filter((m) => m.score >= ANCHOR_MATCH);
}

export function findAnchor(trace: CallTrace, anchor: Anchor): TraceTurn | null {
  const matches = anchorMatches(trace, anchor.said);
  if (!matches.length) return null;
  const best =
    anchor.nth !== undefined
      ? matches[Math.min(anchor.nth, matches.length - 1)]!.turn
      : matches.reduce((a, b) => (b.score > a.score ? b : a)).turn;
  if (!anchor.reply) return best;
  const caller = best;
  return (
    trace.turns.find((t) => t.channel === "agent" && t.replyTo === caller.id) ??
    trace.turns.find((t) => t.channel === "agent" && t.start >= caller.end) ??
    null
  );
}

type Outcome = { pass: boolean; measured: string } | { status: "missing"; measured: string };

function run(trace: CallTrace, check: Check, turn: string | undefined): Outcome {
  switch (check.kind) {
    case "no_finding": {
      // A detector that can't look at this trace finds nothing, and that proves nothing.
      const why = DETECTORS.find((d) => d.id === check.finding)?.needs?.(trace);
      if (why !== undefined) return { status: "missing", measured: why };
      const found = runDetectors(trace, { only: [check.finding] }).filter(
        (f) => f.type === check.finding && (!turn || f.turnId === turn),
      );
      return found.length
        ? { pass: false, measured: found[0]!.message }
        : { pass: true, measured: "nothing flagged" };
    }
    case "reply_within": {
      const replies = trace.turns.filter((t) => t.channel === "agent" && (turn ? t.id === turn : t.replyTo));
      const waits = replies
        .map((t) => latencyBreakdown(trace, t.id)?.measured)
        .filter((w): w is number => w !== undefined);
      if (!waits.length) return { pass: false, measured: "no reply to measure" };
      const longest = Math.max(...waits);
      return { pass: longest <= check.seconds, measured: `waited ${secs(longest)}` };
    }
    case "hears": {
      // On a turn, or on any caller turn when the whole call is in scope.
      const turns = trace.turns.filter((t) => t.channel === "caller" && (!turn || t.id === turn));
      let missing: string[] | undefined;
      for (const t of turns) {
        const heard = trace.words
          .filter((w) => w.turnId === t.id && w.source === "streaming_asr")
          .map((w) => normalizeToken(w.text));
        const lost: string[] = [];
        let at = 0;
        for (const word of check.text.split(/\s+/)) {
          const token = normalizeToken(word);
          if (!token) continue;
          const i = heard.indexOf(token, at);
          if (i === -1) lost.push(word);
          else at = i + 1;
        }
        if (!missing || lost.length < missing.length) missing = lost;
      }
      if (!missing) return { pass: false, measured: "no caller turn to check" };
      return missing.length
        ? { pass: false, measured: `${missing.map((w) => `“${w}”`).join(", ")} not heard` }
        : { pass: true, measured: "every word heard" };
    }
    case "tool_succeeds": {
      const calls = trace.spans.filter(
        (s) => s.kind === "tool" && (s.tool?.name ?? s.name) === check.tool && (!turn || s.turnId === turn),
      );
      if (!calls.length) return { pass: false, measured: `${check.tool} wasn't called` };
      const why = unknownToolResults({ ...trace, spans: calls });
      if (why !== undefined) return { status: "missing", measured: why };
      const failed = calls.find((s) => s.status?.code === "error");
      return failed
        ? { pass: false, measured: failed.status?.message ?? "failed" }
        : { pass: true, measured: `succeeded (${calls.length}×)` };
    }
  }
}

const result = (check: Check, turn: string | undefined, r: Outcome): CheckResult => ({
  check,
  ...("status" in r ? { status: r.status, pass: false } : { status: r.pass ? "pass" : "fail", pass: r.pass }),
  measured: r.measured,
  ...(turn !== undefined && { turn }),
});

/** Each check's result on the call it was drafted from (its turns named by id). */
export function runChecks(trace: CallTrace, checks: readonly Check[]): CheckResult[] {
  return checks.map((check) => result(check, check.turn, run(trace, check, check.turn)));
}

/** A test case's results on any call: on its own, its turns by id; on another, found by their
 * anchors. A check whose turn can't be found is "missing". */
export function runTestCase(trace: CallTrace, test: TestCase): CheckResult[] {
  const own = trace.call.id === test.source.callId;
  return test.checks.map((check) => {
    if (own || (!check.at && !check.turn))
      return result(check, check.turn, run(trace, check, own ? check.turn : undefined));
    if (!check.at)
      return { check, status: "missing", pass: false, measured: "no anchor to find its turn by" };
    const turn = findAnchor(trace, check.at);
    if (!turn) {
      const words = check.at.said.length > 48 ? `${check.at.said.slice(0, 47)}…` : check.at.said;
      return { check, status: "missing", pass: false, measured: `no turn like “${words}”` };
    }
    return result(check, turn.id, run(trace, check, turn.id));
  });
}
