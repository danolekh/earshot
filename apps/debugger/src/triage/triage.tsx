/* The call list: every call with what went wrong in it, to find the bad ones before opening any.
 * A data table (tablecn's, on Base UI): search over titles, words and findings; faceted filters for
 * the findings, severity, outcome, direction and prompt, each option counting the calls it would
 * show; sortable, hideable columns; pages. Its state is the route's URL, so a filtered list is a
 * link, and a call's previous/next walk the same list (lib/triage.ts filters and sorts for both).
 *
 * A call opens at the finding the filters point to; each finding chip opens it at that finding.
 * Keys: / to search, j/k or ↓/↑ to move between calls, Enter to open. */
import {
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  useTable,
  type ColumnVisibilityState,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { type DataTableFeatures, dataTableFeatures } from "@/lib/data-table-features";
import { createStored } from "@/lib/stored";
import {
  type CallSummary,
  callLink,
  facets,
  type Filter,
  FILTERS,
  firstMatch,
  orderedCalls,
  sortOf,
  type TriageSearch,
  valuesOf,
} from "@/lib/triage";

import { useOpenCall } from "./call-link";
import { callColumns, FILTER_COLUMN, filterOptions } from "./columns";
import { ImportDialog } from "./import-dialog";
import { NavTabs } from "./nav-tabs";
import { lastTriage } from "./state";

const PAGE_SIZES = [10, 25, 50, 100];
const PAGE_SIZE = 25;

/** Columns hidden from the View menu, remembered in this browser. */
const hiddenColumns = createStored<ColumnVisibilityState>(
  "debugger:call-columns",
  {},
  (raw) => {
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === "object" ? (v as ColumnVisibilityState) : undefined;
    } catch {
      return undefined;
    }
  },
  (v) => JSON.stringify(v),
);

/** Severity and direction only filter; they're never shown. */
const FILTER_ONLY: ColumnVisibilityState = { severity: false, direction: false };

const resolve = <T,>(u: Updater<T>, current: T): T =>
  typeof u === "function" ? (u as (v: T) => T)(current) : u;

export function Triage({
  calls,
  search,
  onSearch,
}: {
  calls: readonly CallSummary[];
  search: TriageSearch;
  onSearch: (search: TriageSearch) => void;
}) {
  const rows = useMemo(() => orderedCalls(calls, search), [calls, search]);
  const options = useMemo(() => {
    const counts = facets(calls, search);
    return Object.fromEntries(FILTERS.map((f) => [f, filterOptions(calls, f, counts[f])])) as Record<
      Filter,
      ReturnType<typeof filterOptions>
    >;
  }, [calls, search]);
  const columns = useMemo(() => callColumns(search, options), [search, options]);
  const [visibility, setVisibility] = hiddenColumns.use();
  const openCall = useOpenCall();
  const searchBox = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // The call pages walk the list in this order, and go back to it.
  useEffect(() => lastTriage.set(search), [search]);

  const update = (patch: Partial<TriageSearch>) => {
    const next: TriageSearch = { ...search, ...patch };
    for (const key of Object.keys(next) as (keyof TriageSearch)[]) if (!next[key]) delete next[key];
    onSearch(next);
  };

  const sort = sortOf(search);
  const sorting: SortingState = [{ id: sort.column, desc: sort.desc }];
  const columnFilters: ColumnFiltersState = FILTERS.flatMap((f) => {
    const values = valuesOf(search, f);
    return values.length ? [{ id: FILTER_COLUMN[f], value: values }] : [];
  });
  const pagination: PaginationState = {
    pageIndex: (search.page ?? 1) - 1,
    pageSize: search.perPage ?? PAGE_SIZE,
  };

  const table = useTable(
    {
      features: dataTableFeatures,
      columns,
      data: rows,
      getRowId: (row) => row.id,
      state: { sorting, columnFilters, pagination, columnVisibility: { ...visibility, ...FILTER_ONLY } },
      manualSorting: true,
      manualFiltering: true,
      onSortingChange: (u) => {
        const first = resolve(u, sorting)[0];
        update({ sort: first ? `${first.id}.${first.desc ? "desc" : "asc"}` : undefined, page: undefined });
      },
      onColumnFiltersChange: (u) => {
        const next = resolve(u, columnFilters);
        const patch: Partial<TriageSearch> = { page: undefined };
        for (const f of FILTERS) {
          const value = next.find((x) => x.id === FILTER_COLUMN[f])?.value;
          patch[f] = Array.isArray(value) && value.length ? value.join(",") : undefined;
        }
        update(patch);
      },
      onPaginationChange: (u) => {
        const next = resolve(u, pagination);
        update({
          page: next.pageIndex > 0 ? next.pageIndex + 1 : undefined,
          perPage: next.pageSize !== PAGE_SIZE ? next.pageSize : undefined,
        });
      },
      onColumnVisibilityChange: (u) => {
        const {
          severity: _severity,
          direction: _direction,
          ...shown
        } = resolve(u, {
          ...visibility,
          ...FILTER_ONLY,
        });
        setVisibility(shown);
      },
    },
    (state) => ({ sorting: state.sorting, columnFilters: state.columnFilters, pagination: state.pagination }),
  );

  const rowProps = useCallback(
    (row: Row<DataTableFeatures, CallSummary>) => ({
      "data-call": row.original.id,
      className: "cursor-pointer",
      onClick: (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        const target = callLink(row.original, firstMatch(row.original, lastTriage.get()));
        openCall(target.id, target.search);
      },
    }),
    [openCall],
  );

  // One keyboard for the page, from wherever focus is (the body too).
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const typing = target.closest(
      "input, textarea, [role=combobox], [role=listbox], [role=menu], [role=dialog]",
    );
    if (e.key === "/" && !typing) {
      e.preventDefault();
      searchBox.current?.focus();
      return;
    }
    if (typing) {
      if (target === searchBox.current && e.key === "Escape") update({ q: undefined });
      if (target === searchBox.current && e.key === "ArrowDown") {
        e.preventDefault();
        body.current?.querySelector<HTMLElement>("[data-call-link]")?.focus();
      }
      return;
    }
    const step = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || e.metaKey || e.ctrlKey || e.altKey) return;
    const links = [...(body.current?.querySelectorAll<HTMLElement>("[data-call-link]") ?? [])];
    const at = links.findIndex((l) => l === document.activeElement);
    const next = links[at === -1 ? 0 : Math.min(links.length - 1, Math.max(0, at + step))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  const latest = useRef(onKeyDown);
  useEffect(() => {
    latest.current = onKeyDown;
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => latest.current(e);
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const filtered = !!search.q || FILTERS.some((f) => valuesOf(search, f).length > 0);
  const shownOf =
    rows.length === calls.length ? `${calls.length} calls` : `${rows.length} of ${calls.length} calls`;

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="bg-card flex h-10 shrink-0 items-center gap-4 border-b px-4">
        <h1 className="sr-only">Calls</h1>
        <NavTabs />
        <span className="text-muted-foreground font-mono text-xs tabular-nums" aria-live="polite">
          {rows.length === calls.length ? "" : shownOf}
        </span>
        <div className="ml-auto">
          <ImportDialog />
        </div>
      </header>
      <main aria-label="Call list" className="min-h-0 flex-1 overflow-auto p-4">
        <div ref={body}>
          <DataTable
            table={table}
            rowProps={rowProps}
            summary={shownOf}
            pageSizeOptions={PAGE_SIZES}
            className="overflow-visible"
          >
            <div role="toolbar" aria-label="Filters" className="flex w-full items-center gap-2">
              <div className="relative w-72 shrink-0">
                <Search
                  className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  ref={searchBox}
                  type="search"
                  value={search.q ?? ""}
                  onChange={(e) => update({ q: e.target.value || undefined, page: undefined })}
                  placeholder="Search titles, words, findings"
                  aria-label="Search calls"
                  className="h-8 pr-8 pl-7 text-sm"
                />
                <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
              </div>
              {FILTERS.map((f) => {
                const column = table.getColumn(FILTER_COLUMN[f]);
                return (
                  <DataTableFacetedFilter
                    key={f}
                    column={column}
                    title={column?.columnDef.meta?.label ?? f}
                    options={options[f]}
                    multiple
                  />
                );
              })}
              {filtered && (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onSearch({})}>
                  <X aria-hidden />
                  Reset
                </Button>
              )}
              <div className="ml-auto">
                <DataTableViewOptions table={table} align="end" />
              </div>
            </div>
          </DataTable>
        </div>
      </main>
    </div>
  );
}
