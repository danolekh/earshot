"use client";
/* Where a reply's wait went: a bar of its stages, measured from the end of the caller's speech to
 * the agent's first sound, and the same as rows in words, with the time nothing explains last. A
 * stage the stack only reported a length for (no span) is `data-reported`: laid end to end, its
 * place is a guess. */
import type * as React from "react";
import { createContext, useContext, useMemo } from "react";

import { type LatencyBreakdown, type LatencyRow, latencyRows } from "../trace/latency";
import { type PartProps, usePart } from "../utils/part";

interface LatencyContextValue {
  breakdown: LatencyBreakdown;
  rows: readonly LatencyRow[];
}

const LatencyContext = createContext<LatencyContextValue | null>(null);

function useLatency(part: string): LatencyContextValue {
  const ctx = useContext(LatencyContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <Latency.Root>.`);
  return ctx;
}

const ms = (s: number) => `${Math.round(s * 1000)} ms`;
const secs = (s: number) => `${s.toFixed(2)} s`;

export interface LatencyRootState extends Record<string, unknown> {
  /** Some stage was placed from a reported figure, not a span. */
  reported: boolean;
}

export interface LatencyRootProps extends PartProps<"figure", LatencyRootState> {
  /** A reply's wait, from `latencyBreakdown`. */
  breakdown: LatencyBreakdown;
}

/** A reply's wait. Put `Latency.Bar`, `Latency.Stages` and `Latency.Caption` inside. Renders a
 * `<figure>`. */
export function LatencyRoot(props: LatencyRootProps): React.ReactElement {
  const { breakdown, ...rest } = props;
  const ctx = useMemo(() => ({ breakdown, rows: latencyRows(breakdown) }), [breakdown]);
  const reported = breakdown.stages.some((s) => s.reported);
  const element = usePart(
    "latency",
    "figure",
    { reported },
    rest as PartProps<"figure", LatencyRootState>,
    {},
  );
  return <LatencyContext.Provider value={ctx}>{element}</LatencyContext.Provider>;
}

export interface LatencyRowState extends Record<string, unknown> {
  kind: LatencyRow["kind"];
  reported: boolean;
}

/** Where a row sits in the wait, as fractions of it. */
function rowVars(b: LatencyBreakdown, row: LatencyRow): React.CSSProperties {
  const scale = b.measured > 0 ? b.measured : 1;
  return {
    "--stage-start": Math.max(0, (row.start - b.anchor) / scale),
    "--stage-size": Math.max(0, (row.end - row.start) / scale),
  } as React.CSSProperties;
}

export interface LatencyBarProps extends Omit<PartProps<"div", Record<string, never>>, "children"> {
  /** Each row's piece of the bar; a `Latency.Segment` by default. */
  children?: (row: LatencyRow) => React.ReactNode;
}

/** The wait as a bar, presentational (`Latency.Stages` says the same in words). Renders a `<div>`. */
export function LatencyBar(props: LatencyBarProps): React.ReactElement {
  const { children, ...rest } = props;
  const { rows } = useLatency("Latency.Bar");
  return usePart("latency-bar", "div", {}, rest as PartProps<"div", Record<string, never>>, {
    "aria-hidden": true,
    style: { position: "relative" },
    children: rows.map((row) =>
      children ? children(row) : <LatencySegment key={`${row.kind}${row.start}`} row={row} />,
    ),
  });
}

export interface LatencySegmentProps extends PartProps<"span", LatencyRowState> {
  row: LatencyRow;
}

/** A row's piece of the bar: `--stage-start` and `--stage-size` (fractions of the wait), placed
 * absolutely from them. Renders a `<span>`. */
export function LatencySegment(props: LatencySegmentProps): React.ReactElement {
  const { row, ...rest } = props;
  const { breakdown } = useLatency("Latency.Segment");
  return usePart(
    "latency-segment",
    "span",
    { kind: row.kind, reported: row.reported === true },
    rest as PartProps<"span", LatencyRowState>,
    {
      style: {
        ...rowVars(breakdown, row),
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "calc(var(--stage-start) * 100%)",
        width: "calc(var(--stage-size) * 100%)",
      } as React.CSSProperties,
    },
  );
}

export interface LatencyStagesProps extends Omit<PartProps<"ol", Record<string, never>>, "children"> {
  /** Each row; a `Latency.Stage` by default. */
  children?: (row: LatencyRow) => React.ReactNode;
}

/** The wait's rows in words. Renders an `<ol>`. */
export function LatencyStages(props: LatencyStagesProps): React.ReactElement {
  const { children, ...rest } = props;
  const { rows } = useLatency("Latency.Stages");
  return usePart("latency-stages", "ol", {}, rest as PartProps<"ol", Record<string, never>>, {
    children: rows.map((row) =>
      children ? children(row) : <LatencyStage key={`${row.kind}${row.start}`} row={row} />,
    ),
  });
}

export interface LatencyStageProps extends PartProps<"li", LatencyRowState> {
  row: LatencyRow;
}

/** One row: what it was ("gpt-4.1", "crm.lookup", "Unexplained…") and how long it took, unless you
 * give children. Sets the same `--stage-start` / `--stage-size` as its segment. Renders an `<li>`. */
export function LatencyStage(props: LatencyStageProps): React.ReactElement {
  const { row, children, ...rest } = props;
  const { breakdown } = useLatency("Latency.Stage");
  const reported = row.reported === true;
  return usePart(
    "latency-stage",
    "li",
    { kind: row.kind, reported },
    rest as PartProps<"li", LatencyRowState>,
    {
      style: rowVars(breakdown, row),
      children: children ?? `${row.label}${reported ? " (reported)" : ""}: ${ms(row.end - row.start)}`,
    },
  );
}

export interface LatencyCaptionProps extends PartProps<"figcaption", Record<string, never>> {}

/** What the wait is measured against, in one caption: the pipeline's own figure when it reported
 * one, and that stages laid end to end were placed from reported lengths. Hidden when there's
 * neither; your children replace the text. Renders a `<figcaption>`. */
export function LatencyCaption(props: LatencyCaptionProps): React.ReactElement {
  const { children, ...rest } = props;
  const { breakdown: b } = useLatency("Latency.Caption");
  const text = [
    b.reported !== undefined && `Measured on the recording; the pipeline reported ${secs(b.reported)}.`,
    b.stages.some((s) => s.reported) &&
      "The stack reported how long these took, not when: they're laid end to end from the caller's last word.",
  ]
    .filter(Boolean)
    .join(" ");
  return usePart("latency-caption", "figcaption", {}, rest, {
    children: children ?? text,
    ...(!text && children === undefined && { hidden: true }),
  });
}
