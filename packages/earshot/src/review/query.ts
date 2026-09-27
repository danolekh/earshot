/* Finding the bad calls among many: search over what was said and found, filters that each count
 * the calls every option would show (under the other filters), and sorting worst first. Framework
 * free; a list keeps its state wherever it likes (a URL, a store) and hands it in as a query. */
import { FINDING_META, findingLabel } from "../trace/findings";
import type { FindingType } from "../trace/types";
import type { CallSummary, FindingSummary } from "./summary";

/** What calls can be filtered by, each a set of values a call must match one of. */
export const CALL_FILTERS: readonly ["type", "severity", "outcome", "direction", "prompt", "provider"] = [
  "type",
  "severity",
  "outcome",
  "direction",
  "prompt",
  "provider",
];
export type CallFilter = (typeof CALL_FILTERS)[number];

/** A call's worst finding, as the severity filter names it. */
export type SeverityScope = "error" | "warning" | "clean";

export interface CallQuery {
  /** Words that must all appear (case and accents ignored) in the title, what was said or found. */
  text?: string;
  /** Per filter, the values a call must match one of; an empty list doesn't filter. */
  filters?: Partial<Record<CallFilter, readonly string[]>>;
}

export const callSeverity = (call: CallSummary): SeverityScope =>
  call.errors ? "error" : call.warnings ? "warning" : "clean";

/** A call's value for a filter (every finding type it has, for `type`). */
export function callValues(call: CallSummary, filter: CallFilter): string[] {
  switch (filter) {
    case "type":
      return [...new Set(call.findings.map((f) => f.type))];
    case "severity":
      return [callSeverity(call)];
    case "outcome":
      return call.achieved === undefined ? [] : [call.achieved ? "done" : "not-done"];
    case "direction":
      return call.direction ? [call.direction] : [];
    case "prompt":
      return call.prompt ? [call.prompt] : [];
    case "provider":
      return call.provider ? [call.provider] : [];
  }
}

/** Lower case, no accents: "Özdemir" matches "ozdemir". */
const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

function matchesText(call: CallSummary, text: string | undefined): boolean {
  if (!text) return true;
  const hay = fold(
    [
      call.title,
      call.id,
      call.agent,
      call.prompt,
      call.goal,
      call.text,
      ...call.findings.flatMap((f) => [findingLabel(f.type), f.message]),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return fold(text)
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

/** The calls that match; `except` leaves one filter out (for that filter's own counts). */
export function filterCalls(
  calls: readonly CallSummary[],
  query: CallQuery,
  except?: CallFilter,
): CallSummary[] {
  return calls.filter(
    (call) =>
      matchesText(call, query.text) &&
      CALL_FILTERS.every((f) => {
        const want = query.filters?.[f];
        return f === except || !want?.length || callValues(call, f).some((v) => want.includes(v));
      }),
  );
}

/** For each filter, how many calls each of its values would show with every other filter applied. */
export function facets(
  calls: readonly CallSummary[],
  query: CallQuery,
): Record<CallFilter, Map<string, number>> {
  const out = Object.fromEntries(CALL_FILTERS.map((f) => [f, new Map<string, number>()])) as Record<
    CallFilter,
    Map<string, number>
  >;
  for (const f of CALL_FILTERS)
    for (const call of filterCalls(calls, query, f))
      for (const v of callValues(call, f)) out[f].set(v, (out[f].get(v) ?? 0) + 1);
  return out;
}

/** Every value a filter can take in these calls, in a fixed order (so options never move). */
export function filterValues(calls: readonly CallSummary[], filter: CallFilter): string[] {
  switch (filter) {
    case "type": {
      const present = new Set(calls.flatMap((c) => c.findings.map((f) => f.type)));
      return (Object.keys(FINDING_META) as FindingType[]).filter((t) => present.has(t));
    }
    case "severity":
      return ["error", "warning", "clean"];
    case "outcome":
      return ["done", "not-done"];
    case "direction":
      return ["inbound", "outbound"];
    case "prompt":
    case "provider":
      return [...new Set(calls.flatMap((c) => callValues(c, filter)))].sort();
  }
}

/** Where a call opens from a filtered list: its first finding of the filtered types (an error,
 * when only errors are shown). */
export function firstFinding(
  call: CallSummary,
  options: { types?: readonly FindingType[]; errorsOnly?: boolean } = {},
): FindingSummary | undefined {
  const types = options.types ?? [];
  const typed = (f: FindingSummary) => !types.length || types.includes(f.type);
  return (
    call.findings.find((f) => typed(f) && (!options.errorsOnly || f.severity === "error")) ??
    call.findings.find(typed)
  );
}

/** What a list sorts by. */
export const CALL_SORT_COLUMNS: readonly [
  "call",
  "started",
  "length",
  "findings",
  "slowest",
  "outcome",
  "prompt",
  "provider",
] = ["call", "started", "length", "findings", "slowest", "outcome", "prompt", "provider"];
export type CallSortColumn = (typeof CALL_SORT_COLUMNS)[number];
export interface CallSort {
  column: CallSortColumn;
  desc: boolean;
}
/** Worst first. */
export const DEFAULT_CALL_SORT: CallSort = { column: "findings", desc: true };

const time = (c: CallSummary) => (c.startedAt ? Date.parse(c.startedAt) : 0);
const COMPARE: Readonly<Record<CallSortColumn, (a: CallSummary, b: CallSummary) => number>> = {
  call: (a, b) => a.title.localeCompare(b.title),
  started: (a, b) => time(a) - time(b),
  length: (a, b) => a.duration - b.duration,
  findings: (a, b) => a.errors - b.errors || a.warnings - b.warnings,
  slowest: (a, b) => (a.slowestReply ?? 0) - (b.slowestReply ?? 0),
  outcome: (a, b) => Number(a.achieved ?? -1) - Number(b.achieved ?? -1),
  prompt: (a, b) => (a.prompt ?? "").localeCompare(b.prompt ?? ""),
  provider: (a, b) => (a.provider ?? "").localeCompare(b.provider ?? ""),
};

/** Sorted by a column; ties go to the most recent, then by id, so the order never wobbles. */
export function sortCalls(calls: readonly CallSummary[], sort: CallSort = DEFAULT_CALL_SORT): CallSummary[] {
  const dir = sort.desc ? -1 : 1;
  return [...calls].sort(
    (a, b) => dir * COMPARE[sort.column](a, b) || time(b) - time(a) || a.id.localeCompare(b.id),
  );
}
