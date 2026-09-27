/* Triage across calls, as the list's URL holds it: the filters as comma-separated values, the sort
 * as `<column>.<dir>`, and links from before the table still read. Summing a call up, searching,
 * counting and sorting are earshot's (@danolekh/earshot/review); a call is summed up once (by the copy
 * script, into src/calls/index.json) so the list never loads a whole trace. Pure, and importing
 * only packages, so node can run it too. */
import {
  CALL_SORT_COLUMNS,
  type CallQuery,
  type CallSummary,
  type CallSort,
  callSeverity,
  DEFAULT_CALL_SORT,
  facets as countFacets,
  filterCalls as filterBy,
  type FindingSummary,
  filterValues as valuesIn,
  firstFinding,
  momentFor,
  type SeverityScope,
  sortCalls,
} from "@danolekh/earshot/review";
import { type FindingType, findingLabel } from "@danolekh/earshot/trace";

export type { CallSummary, FindingSummary } from "@danolekh/earshot/review";
export { summarizeCall } from "@danolekh/earshot/review";

export const SORT_COLUMNS: typeof CALL_SORT_COLUMNS = CALL_SORT_COLUMNS;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type Sort = CallSort;
/** Worst first. */
export const DEFAULT_SORT: Sort = DEFAULT_CALL_SORT;

/** The filters, each a set of values a call must match one of. */
export const FILTERS = ["type", "severity", "outcome", "direction", "prompt", "provider"] as const;
export type Filter = (typeof FILTERS)[number];

export type { SeverityScope };

/** The list's state, as it sits in the URL. Lists are comma-separated. */
export interface TriageSearch {
  q?: string;
  /** Finding types: calls with any of them. */
  type?: string;
  /** A call's worst finding: error, warning, or clean. */
  severity?: string;
  outcome?: string;
  direction?: string;
  prompt?: string;
  /** The stacks the calls were recorded on. */
  provider?: string;
  /** `<column>.<asc|desc>`; worst first when left out. */
  sort?: string;
  /** 1-based. */
  page?: number;
  perPage?: number;
}

const VALUES: Readonly<Record<Filter, RegExp>> = {
  type: /^[a-z_]{2,40}$/,
  severity: /^(error|warning|clean)$/,
  outcome: /^(done|not-done)$/,
  direction: /^(inbound|outbound)$/,
  prompt: /^[\w@.:-]{1,60}$/,
  provider: /^[a-z0-9-]{2,30}$/,
};

/** Sorts the list's URL used to have, as they read now. */
const OLD_SORTS: Readonly<Record<string, string>> = {
  severity: "findings.desc",
  recent: "started.desc",
  slowest: "slowest.desc",
  longest: "length.desc",
};

const list = (v: unknown, re: RegExp) =>
  typeof v === "string" ? [...new Set(v.split(",").filter((x) => re.test(x)))].slice(0, 30) : [];

export function parseTriageSearch(raw: Record<string, unknown>): TriageSearch {
  const out: TriageSearch = {};
  if (typeof raw.q === "string" && raw.q.trim()) out.q = raw.q.trim().slice(0, 120);
  for (const f of FILTERS) {
    const values = list(raw[f], VALUES[f]);
    if (values.length) out[f] = values.join(",");
  }
  // Links from before the severity filter: "errors only".
  if (
    !out.severity &&
    (raw.errors === true || raw.errors === 1 || raw.errors === "1" || raw.errors === "true")
  )
    out.severity = "error";
  const sort = typeof raw.sort === "string" ? (OLD_SORTS[raw.sort] ?? raw.sort) : undefined;
  const parsed = sort ? readSort(sort) : undefined;
  if (parsed && !(parsed.column === DEFAULT_SORT.column && parsed.desc === DEFAULT_SORT.desc))
    out.sort = `${parsed.column}.${parsed.desc ? "desc" : "asc"}`;
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1 && page < 10_000) out.page = page;
  const perPage = Number(raw.perPage);
  if ([10, 25, 50, 100].includes(perPage) && perPage !== 25) out.perPage = perPage;
  return out;
}

function readSort(v: string): Sort | undefined {
  const [column, dir] = v.split(".");
  const c = SORT_COLUMNS.find((x) => x === column);
  return c && (dir === "asc" || dir === "desc") ? { column: c, desc: dir === "desc" } : undefined;
}

export const sortOf = (search: TriageSearch): Sort => (search.sort && readSort(search.sort)) || DEFAULT_SORT;

export const valuesOf = (search: TriageSearch, filter: Filter): string[] => search[filter]?.split(",") ?? [];

export const typesOf = (search: TriageSearch): FindingType[] => valuesOf(search, "type") as FindingType[];

/** A finding type's name, as the list shows it. */
export const typeLabel = (type: FindingType): string => findingLabel(type);

/** A call's worst finding. */
export const severityOf = (call: CallSummary): SeverityScope => callSeverity(call);

/** The URL's filters as earshot's query. */
export const queryOf = (search: TriageSearch): CallQuery => ({
  ...(search.q && { text: search.q }),
  filters: Object.fromEntries(FILTERS.map((f) => [f, valuesOf(search, f)])),
});

/** The calls that pass every filter; `except` leaves one out (for that filter's own counts). */
export const filterCalls = (
  calls: readonly CallSummary[],
  search: TriageSearch,
  except?: Filter,
): CallSummary[] => filterBy(calls, queryOf(search), except);

/** For each filter, how many calls each of its values would show with every other filter applied. */
export const facets = (
  calls: readonly CallSummary[],
  search: TriageSearch,
): Record<Filter, Map<string, number>> => countFacets(calls, queryOf(search));

/** Every value a filter can take in these calls, in a fixed order (so options never move). */
export const filterValues = (calls: readonly CallSummary[], filter: Filter): string[] =>
  valuesIn(calls, filter);

/** The first finding a filtered list would open a call at. */
export const firstMatch = (call: CallSummary, search: TriageSearch): FindingSummary | undefined =>
  firstFinding(call, { types: typesOf(search), errorsOnly: valuesOf(search, "severity").join() === "error" });

export { sortCalls };

/** The list as the filters and sort show it: what the table pages through, and what a call's
 * previous/next walk. */
export const orderedCalls = (calls: readonly CallSummary[], search: TriageSearch): CallSummary[] =>
  sortCalls(filterCalls(calls, search), sortOf(search));

/** Where a call opens from the list: at the finding the filters point to, a moment before it. */
export function callLink(
  call: CallSummary,
  finding?: FindingSummary,
): { id: string; search: { finding?: string; t?: number } } {
  return {
    id: call.id,
    search: finding
      ? momentFor({
          start: finding.start,
          finding: finding.id,
          ...(finding.turnId && { turn: finding.turnId }),
        })
      : {},
  };
}
