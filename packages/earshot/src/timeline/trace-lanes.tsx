"use client";
/* Lanes for a call trace, inside a `Timeline.Scrubber`: the pipeline's spans as a waterfall, the
 * turn detector's decisions and interruptions, words from one source (what the agent heard, what
 * was said, what it generated) marked where another differs, and what the detectors found. Each
 * part takes plain data, places itself against the view like every timeline part, and says what it
 * is in `data-*` attributes and CSS variables; picking one (pointer down) sets the player's
 * selection. They're presentational: the scrubber and your own lists are the accessible way in. */
import type * as React from "react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { formatTime } from "../core/conversation";
import { usePlayer, useSelected } from "../player/context";
import { diffTokens, normalizeToken } from "../trace/diff";
import { describeSignal } from "../trace/signals";
import type { Finding, TraceSignal, TraceSpan, TraceWord } from "../trace/types";
import { type PartProps, usePart } from "../utils/part";
import { useIsoLayoutEffect } from "../utils/use-iso-layout-effect";
import { type Cluster, clusterByPixels, layoutSpans, type PlacedSpan, worst } from "./layout";
import { placeStyle } from "./place";
import { useTimeline } from "./timeline";
import { viewAround } from "./viewport";

const ms = (seconds: number) => `${Math.round(seconds * 1000)} ms`;

export interface TimelineItemProps extends PartProps<"div", Record<string, unknown>> {
  start: number;
  /** Leave out for a point. */
  end?: number;
  /** Which row, as `--item-row`, for stacking. */
  row?: number;
}

/** Anything with a time: placed from `start` to `end` like a marker, for what earshot has no part
 * for (a context strip, a note). Renders a `<div>`. */
export function TimelineItem(props: TimelineItemProps): React.ReactElement {
  const { start, end, row = 0, ...rest } = props;
  const { duration } = useTimeline("Timeline.Item");
  return usePart("timeline-item", "div", {}, rest, {
    "aria-hidden": true,
    style: {
      ...placeStyle(start, end, duration),
      position: "absolute",
      "--item-row": row,
    } as React.CSSProperties,
  });
}

export interface TimelineSpansProps {
  spans: readonly TraceSpan[];
  /** `kind`: a row per stage (end of turn, STT, LLM, tool, TTS, playout), outermost spans only.
   * `depth`: every span, a row per nesting level. */
  rows?: "kind" | "depth";
  children?: (placed: PlacedSpan) => React.ReactNode;
}

/** The pipeline's spans as a waterfall, a `Timeline.Span` each. */
export function TimelineSpans(props: TimelineSpansProps): React.ReactElement {
  const { spans, rows = "kind", children } = props;
  const placed = useMemo(() => layoutSpans(spans, rows), [spans, rows]);
  return <>{placed.map((p) => (children ? children(p) : <TimelineSpan key={p.span.id} {...p} />))}</>;
}

export interface TimelineSpanState extends Record<string, unknown> {
  kind: TraceSpan["kind"];
  status: "unset" | "ok" | "error";
  selected: boolean;
  /** Worked out rather than traced (`data-estimated`). */
  estimated: boolean;
}

export interface TimelineSpanProps extends PartProps<"div", TimelineSpanState>, PlacedSpan {}

/** One span: placed over its time, `--span-row` for its row, `--span-mark` (0..1) where its first
 * token or byte came, `data-status="error"` when it failed, `data-estimated` when it was worked
 * out rather than traced. Renders a `<div>`. */
export function TimelineSpan(props: TimelineSpanProps): React.ReactElement {
  const { span, row, mark, ...rest } = props;
  const { duration } = useTimeline("Timeline.Span");
  const { selection } = usePlayer("Timeline.Span");
  const selected = useSelected(selection, "spanId", span.id);
  const label = span.tool?.name ?? span.name;
  return usePart(
    "timeline-span",
    "div",
    { kind: span.kind, status: span.status?.code ?? "unset", selected, estimated: span.estimated === true },
    rest as PartProps<"div", TimelineSpanState>,
    {
      "aria-hidden": true,
      title: `${label} · ${ms(span.end - span.start)}${span.estimated ? " (worked out)" : ""}${span.status?.message ? ` · ${span.status.message}` : ""}`,
      onPointerDown: () =>
        selection.set({ spanId: span.id, ...(span.turnId !== undefined && { turnId: span.turnId }) }),
      style: {
        ...placeStyle(span.start, Math.max(span.end, span.start + 0.01), duration),
        position: "absolute",
        "--span-row": row,
        ...(mark !== undefined && { "--span-mark": mark }),
      } as React.CSSProperties,
    },
  );
}

export interface TimelineSignalsProps {
  signals: readonly TraceSignal[];
  /** Which ones; all by default. */
  filter?: (signal: TraceSignal) => boolean;
  children?: (signal: TraceSignal) => React.ReactNode;
}

/** Turn-taking and the like, a `Timeline.Signal` each. */
export function TimelineSignals(props: TimelineSignalsProps): React.ReactElement {
  const { signals, filter, children } = props;
  const shown = filter ? signals.filter(filter) : signals;
  return <>{shown.map((s) => (children ? children(s) : <TimelineSignal key={s.id} signal={s} />))}</>;
}

export interface TimelineSignalState extends Record<string, unknown> {
  type: TraceSignal["type"];
  /** An end-of-turn decision's outcome. */
  outcome: string | undefined;
  /** An interruption's decision. */
  decision: string | undefined;
}

export interface TimelineSignalProps extends PartProps<"div", TimelineSignalState> {
  signal: TraceSignal;
}

/** A signal: speech detected spans its length; an end-of-turn decision spans its wait (from the
 * last sound to the decision, `--eou-probability` 0..1 and `data-outcome`); an interruption, a
 * false interruption or a backchannel sits at its moment. Renders a `<div>`. */
export function TimelineSignal(props: TimelineSignalProps): React.ReactElement {
  const { signal: s, ...rest } = props;
  const { duration } = useTimeline("Timeline.Signal");
  const [start, end] = s.type === "eou_decision" ? [s.at - s.data.wait, s.at] : [s.at, s.end];
  return usePart(
    "timeline-signal",
    "div",
    {
      type: s.type,
      outcome: s.type === "eou_decision" ? s.data.outcome : undefined,
      decision: s.type === "interruption" ? s.data.decision : undefined,
    },
    rest as PartProps<"div", TimelineSignalState>,
    {
      "aria-hidden": true,
      title: `${formatTime(s.at)} ${describeSignal(s)}`,
      style: {
        ...placeStyle(start, end, duration),
        position: "absolute",
        ...(s.type === "eou_decision" &&
          s.data.probability !== undefined && { "--eou-probability": s.data.probability }),
      } as React.CSSProperties,
    },
  );
}

export interface TimelineWordsProps {
  words: readonly TraceWord[];
  /** Another source's words for the same turns: words here it doesn't have get `data-mismatch`. */
  compare?: readonly TraceWord[];
  children?: (word: TraceWord, mismatch: boolean) => React.ReactNode;
}

const byTurn = (words: readonly TraceWord[]) => {
  const out = new Map<string, TraceWord[]>();
  for (const w of words) out.set(w.turnId ?? "", [...(out.get(w.turnId ?? "") ?? []), w]);
  return out;
};

/** Words from one source, a `Timeline.Word` each, marked where `compare` differs. */
export function TimelineWords(props: TimelineWordsProps): React.ReactElement {
  const { words, compare, children } = props;
  const mismatched = useMemo(() => {
    const out = new Set<string>();
    if (!compare) return out;
    const other = byTurn(compare);
    for (const [turn, own] of byTurn(words)) {
      const theirs = other.get(turn);
      if (!theirs) continue;
      for (const d of diffTokens(own, theirs, (a, b) => normalizeToken(a.text) === normalizeToken(b.text)))
        if (d.op === "extra" || d.op === "changed") out.add(d.a.id);
    }
    return out;
  }, [words, compare]);
  return (
    <>
      {words.map((w) =>
        children ? (
          children(w, mismatched.has(w.id))
        ) : (
          <TimelineWord key={w.id} word={w} mismatch={mismatched.has(w.id)} />
        ),
      )}
    </>
  );
}

export interface TimelineWordState extends Record<string, unknown> {
  source: TraceWord["source"];
  /** False for an agent word the caller never heard (cut off before it). */
  heard: boolean | undefined;
  /** The other source doesn't have it (or has something else). */
  mismatch: boolean;
  entity: string | undefined;
  /** Timings spread over the turn, not measured. */
  estimated: boolean;
}

export interface TimelineWordProps extends PartProps<"div", TimelineWordState> {
  word: TraceWord;
  mismatch?: boolean;
}

/** A word over its time, with `--word-confidence` (0..1) when the recogniser gave one. Renders a
 * `<div>` holding the word. */
export function TimelineWord(props: TimelineWordProps): React.ReactElement {
  const { word: w, mismatch = false, ...rest } = props;
  const { duration } = useTimeline("Timeline.Word");
  return usePart(
    "timeline-word",
    "div",
    { source: w.source, heard: w.heard, mismatch, entity: w.entity, estimated: w.estimated === true },
    rest as PartProps<"div", TimelineWordState>,
    {
      "aria-hidden": true,
      children: w.text,
      title: w.confidence !== undefined ? `${w.text} (${w.confidence.toFixed(2)})` : w.text,
      style: {
        ...placeStyle(w.start, Math.max(w.end, w.start + 0.02), duration),
        position: "absolute",
        ...(w.confidence !== undefined && { "--word-confidence": w.confidence }),
      } as React.CSSProperties,
    },
  );
}

export interface TimelineFindingsProps {
  findings: readonly Finding[];
  /** Findings closer than this many pixels merge into a `Timeline.FindingCluster`; 6 by default. */
  minGap?: number;
  children?: (cluster: Cluster<Finding>) => React.ReactNode;
}

/** What the detectors found, a `Timeline.Finding` each, merged into clusters where they'd crowd at
 * the current zoom. Re-renders only when the clusters change. Renders its items into a `<div>`
 * that fills the lane (to measure it). */
export function TimelineFindings(props: TimelineFindingsProps): React.ReactElement {
  const { findings, minGap = 6, children } = props;
  const { viewport } = useTimeline("Timeline.Findings");
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Until the lane is measured (and on the server), cluster as if it were 1000 px wide.
  const snapshot = () =>
    clusterByPixels(findings, viewport.get(), width || 1000, minGap)
      .map((c) => c.items.map((f) => f.id).join("+"))
      .join(",");
  const key = useSyncExternalStore(viewport.subscribe, snapshot, snapshot);
  const clusters = useMemo(() => {
    const byId = new Map(findings.map((f) => [f.id, f]));
    return key
      ? key.split(",").map((group) => {
          const items = group.split("+").map((id) => byId.get(id)!);
          return {
            items,
            start: Math.min(...items.map((f) => f.start)),
            end: Math.max(...items.map((f) => f.end)),
          };
        })
      : [];
  }, [key, findings]);
  return (
    <div ref={ref} data-slot="timeline-findings" aria-hidden style={{ position: "absolute", inset: 0 }}>
      {clusters.map((c) =>
        children ? (
          children(c)
        ) : c.items.length === 1 ? (
          <TimelineFinding key={c.items[0]!.id} finding={c.items[0]!} />
        ) : (
          <TimelineFindingCluster key={c.items.map((f) => f.id).join("+")} cluster={c} />
        ),
      )}
    </div>
  );
}

export interface TimelineFindingState extends Record<string, unknown> {
  type: Finding["type"];
  severity: Finding["severity"];
  selected: boolean;
}

export interface TimelineFindingProps extends PartProps<"div", TimelineFindingState> {
  finding: Finding;
}

/** One finding at its moment, spanning its evidence; its `title` says what was found. Pointer
 * down picks it (and its turn). Give each `data-type` its own shape in your CSS, not only a colour.
 * Renders a `<div>`. */
export function TimelineFinding(props: TimelineFindingProps): React.ReactElement {
  const { finding: f, ...rest } = props;
  const { duration } = useTimeline("Timeline.Finding");
  const { selection } = usePlayer("Timeline.Finding");
  const selected = useSelected(selection, "findingId", f.id);
  return usePart(
    "timeline-finding",
    "div",
    { type: f.type, severity: f.severity, selected },
    rest as PartProps<"div", TimelineFindingState>,
    {
      title: `${formatTime(f.start)} ${f.message}`,
      onPointerDown: () =>
        selection.set({ findingId: f.id, ...(f.turnId !== undefined && { turnId: f.turnId }) }),
      style: { ...placeStyle(f.start, Math.max(f.end, f.start), duration), position: "absolute" },
    },
  );
}

export interface TimelineFindingClusterState extends Record<string, unknown> {
  count: number;
  severity: Finding["severity"];
}

export interface TimelineFindingClusterProps extends PartProps<"div", TimelineFindingClusterState> {
  cluster: Cluster<Finding>;
}

/** Findings too close to tell apart at this zoom: `data-count` says how many, `data-severity` the
 * worst. Pointer down zooms in until they separate. Renders a `<div>` holding the count. */
export function TimelineFindingCluster(props: TimelineFindingClusterProps): React.ReactElement {
  const { cluster, ...rest } = props;
  const { duration, viewport } = useTimeline("Timeline.FindingCluster");
  const count = cluster.items.length;
  return usePart(
    "timeline-finding-cluster",
    "div",
    { count, severity: worst(cluster.items) },
    rest as PartProps<"div", TimelineFindingClusterState>,
    {
      children: count,
      title: cluster.items.map((f) => `${formatTime(f.start)} ${f.message}`).join("\n"),
      onPointerDown: () => {
        viewport.set(viewAround(cluster, { share: 0.5, min: 0.5 }));
      },
      style: { ...placeStyle(cluster.start, cluster.end, duration), position: "absolute" },
    },
  );
}
