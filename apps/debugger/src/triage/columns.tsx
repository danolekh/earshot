/* The call list's columns, for the data table: what each shows, how it sorts, and the filters that
 * hang off them (with each option's count under the other filters). Severity and direction are
 * filter-only columns, never shown. */

import { formatTime } from "@danolekh/earshot/core";
import type { FindingType, Severity } from "@danolekh/earshot/trace";
import { findingLabel, findingShort, groupFindings, worstSeverity } from "@danolekh/earshot/trace";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  PhoneIncoming,
  PhoneOutgoing,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import { FindingIcon } from "@/debugger/finding-icon";
import type { DataTableFeatures } from "@/lib/data-table-features";
import type { Option } from "@/lib/data-table-types";
import { deleteImport, isImported, putImport } from "@/lib/imports";
import { STACK_NAMES, stackName } from "@/lib/stacks";
import {
  type CallSummary,
  callLink,
  type Filter,
  filterValues,
  firstMatch,
  severityOf,
  type TriageSearch,
  typesOf,
} from "@/lib/triage";

import { CallLink } from "./call-link";

// Fixed zone and locale, so the prerendered page and the browser agree.
const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/** The column each filter hangs off. */
export const FILTER_COLUMN: Readonly<Record<Filter, string>> = {
  type: "findings",
  severity: "severity",
  outcome: "outcome",
  direction: "direction",
  prompt: "prompt",
  provider: "provider",
};

/** An option's icon, as the data table's filters take them. */
const optionIcon = (type: FindingType, severity: Severity) => {
  const Icon = () => <FindingIcon type={type} severity={severity} />;
  Icon.displayName = `FindingIcon(${type})`;
  return Icon;
};
const plainIcon = (Icon: React.ComponentType<{ className?: string }>, className: string) => {
  const Wrapped = () => <Icon className={`size-3.5 ${className}`} />;
  return Wrapped;
};

const LABELS: Readonly<Record<Exclude<Filter, "type" | "prompt">, Readonly<Record<string, string>>>> = {
  severity: { error: "Has errors", warning: "Warnings only", clean: "No findings" },
  outcome: { done: "Done", "not-done": "Not done" },
  direction: { inbound: "Inbound", outbound: "Outbound" },
  provider: STACK_NAMES,
};

const SEVERITY_ICONS: Readonly<Record<string, React.ComponentType>> = {
  error: plainIcon(CircleAlert, "text-destructive"),
  warning: plainIcon(TriangleAlert, "text-warning"),
  clean: plainIcon(CircleCheck, "text-muted-foreground"),
};

/** A filter's options, in a fixed order, each with its count under the other filters. */
export function filterOptions(
  calls: readonly CallSummary[],
  filter: Filter,
  counts: Map<string, number>,
): Option[] {
  const worst = new Map<FindingType, Severity>();
  for (const c of calls)
    for (const f of c.findings)
      worst.set(f.type, worstSeverity([{ severity: worst.get(f.type) ?? "info" }, f]));
  return filterValues(calls, filter).map((value) => ({
    value,
    count: counts.get(value) ?? 0,
    label:
      filter === "type"
        ? findingLabel(value as FindingType)
        : filter === "prompt"
          ? value
          : (LABELS[filter][value] ?? value),
    ...(filter === "type" && {
      icon: optionIcon(value as FindingType, worst.get(value as FindingType) ?? "warning"),
    }),
    ...(filter === "severity" && SEVERITY_ICONS[value] && { icon: SEVERITY_ICONS[value] }),
  }));
}

const helper = createColumnHelper<DataTableFeatures, CallSummary>();

export function callColumns(
  search: TriageSearch,
  options: Readonly<Record<Filter, Option[]>>,
): ColumnDef<DataTableFeatures, CallSummary, unknown>[] {
  const highlight = typesOf(search);
  return helper.columns([
    helper.accessor("title", {
      id: "call",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Call" />,
      cell: ({ row }) => <CallCell call={row.original} search={search} />,
      enableHiding: false,
      meta: { label: "Call" },
    }),
    helper.accessor((c) => c.startedAt ?? "", {
      id: "started",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Started" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
          {row.original.startedAt ? WHEN.format(new Date(row.original.startedAt)) : "—"}
        </span>
      ),
      meta: { label: "Started" },
    }),
    helper.accessor("duration", {
      id: "length",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Length" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{formatTime(row.original.duration)}</span>
      ),
      meta: { label: "Length" },
    }),
    helper.accessor((c) => c.errors * 1000 + c.warnings, {
      id: "findings",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Findings" />,
      cell: ({ row }) => <Chips call={row.original} highlight={highlight} />,
      enableColumnFilter: true,
      meta: { label: "Findings", variant: "multiSelect", options: options.type },
    }),
    helper.accessor((c) => c.slowestReply ?? 0, {
      id: "slowest",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Slowest reply" />,
      cell: ({ row }) => {
        const s = row.original.slowestReply;
        const level = s === undefined ? undefined : s > 3 ? "error" : s > 1.5 ? "warning" : undefined;
        return (
          <span
            data-slow={level}
            className="data-[slow=error]:text-destructive data-[slow=warning]:text-warning font-mono text-xs tabular-nums"
          >
            {s === undefined ? "—" : `${s.toFixed(2)} s`}
          </span>
        );
      },
      meta: { label: "Slowest reply" },
    }),
    helper.accessor((c) => (c.achieved === undefined ? -1 : Number(c.achieved)), {
      id: "outcome",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Outcome" />,
      cell: ({ row }) => <Outcome achieved={row.original.achieved} />,
      enableColumnFilter: true,
      meta: { label: "Outcome", variant: "multiSelect", options: options.outcome },
    }),
    helper.accessor((c) => c.prompt ?? "", {
      id: "prompt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Prompt" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-xs">{row.original.prompt ?? "—"}</span>
      ),
      enableColumnFilter: true,
      meta: { label: "Prompt", variant: "multiSelect", options: options.prompt },
    }),
    helper.accessor((c) => c.provider ?? "", {
      id: "provider",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Stack" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{stackName(row.original.provider)}</span>
      ),
      enableColumnFilter: true,
      meta: { label: "Stack", variant: "multiSelect", options: options.provider },
    }),
    // Filter-only columns.
    helper.accessor((c) => severityOf(c), {
      id: "severity",
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: true,
      meta: { label: "Severity", variant: "multiSelect", options: options.severity },
    }),
    helper.accessor((c) => c.direction ?? "", {
      id: "direction",
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: true,
      meta: { label: "Direction", variant: "multiSelect", options: options.direction },
    }),
  ]) as ColumnDef<DataTableFeatures, CallSummary, unknown>[];
}

function CallCell({ call, search }: { call: CallSummary; search: TriageSearch }) {
  const target = callLink(call, firstMatch(call, search));
  const Direction = call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  return (
    <div className="flex items-center gap-2.5">
      <Direction className="text-muted-foreground size-4 shrink-0" aria-label={call.direction ?? "call"} />
      <div className="min-w-0">
        <CallLink
          id={target.id}
          search={target.search}
          data-call-link
          className="focus-visible:ring-ring rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {call.title}
        </CallLink>
        {isImported(call.id) && <Imported call={call} />}
        {call.goal && <div className="text-muted-foreground text-xs">{call.goal}</div>}
      </div>
    </div>
  );
}

/** An imported call's mark in the list, and its remove button (with Undo). */
function Imported({ call }: { call: CallSummary }) {
  const remove = async () => {
    const entry = await deleteImport(call.id);
    if (!entry) return;
    toast(`Removed “${call.title}”`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => void putImport(entry) },
    });
  };
  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle">
      <span className="bg-muted text-muted-foreground rounded px-1.5 text-[10px] leading-4">Imported</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove “${call.title}”`}
        onClick={() => void remove()}
        className="text-muted-foreground"
      >
        <Trash2 aria-hidden />
      </Button>
    </span>
  );
}

function Outcome({ achieved }: { achieved: boolean | undefined }) {
  if (achieved === undefined) return <span className="text-muted-foreground">—</span>;
  return achieved ? (
    <span className="text-primary inline-flex items-center gap-1 text-xs">
      <CircleCheck className="size-3.5" aria-hidden /> Done
    </span>
  ) : (
    <span className="text-destructive inline-flex items-center gap-1 text-xs">
      <CircleX className="size-3.5" aria-hidden /> Not done
    </span>
  );
}

/** A call's findings, one chip per type (worst severity, how many), each opening at the first; the
 * first three, then how many more. */
function Chips({ call, highlight }: { call: CallSummary; highlight: readonly FindingType[] }) {
  const all = groupFindings(call.findings);
  if (!all.length)
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <CircleCheck className="size-3.5" aria-hidden /> No findings
      </span>
    );
  // Picked types first, so a filtered list shows why each call is in it.
  const ordered = highlight.length
    ? [...all.filter((g) => highlight.includes(g.type)), ...all.filter((g) => !highlight.includes(g.type))]
    : all;
  const shown = ordered.slice(0, 3);
  const rest = ordered.slice(3);
  return (
    <ul className="m-0 flex min-w-88 list-none flex-wrap items-center gap-1 p-0">
      {shown.map((g) => {
        const target = callLink(call, g.first);
        return (
          <li key={g.type}>
            <CallLink
              id={target.id}
              search={target.search}
              data-severity={g.severity}
              data-dim={highlight.length > 0 && !highlight.includes(g.type) ? "" : undefined}
              className="bg-muted/60 hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 data-dim:opacity-50"
            >
              <FindingIcon type={g.type} severity={g.severity} className="size-3" />
              {findingShort(g.type)}
              {g.count > 1 && <span className="text-muted-foreground font-mono">×{g.count}</span>}
            </CallLink>
          </li>
        );
      })}
      {rest.length > 0 && (
        <li
          className="text-muted-foreground text-[11px]"
          title={rest.map((g) => findingLabel(g.type)).join(", ")}
        >
          +{rest.length} more
        </li>
      )}
    </ul>
  );
}
