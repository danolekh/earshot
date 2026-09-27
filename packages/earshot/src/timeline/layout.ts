/* Laying things out in rows: spans one row per pipeline stage (or by nesting), anything that
 * overlaps packed into as few rows as it needs, and markers too close to tell apart at the current
 * zoom merged into a count. Pure functions. */

import { worstSeverity } from "../trace/findings";
import type { Finding, SpanKind, TraceSpan } from "../trace/types";
import type { View } from "./viewport";

/** Rows for items that may overlap: each goes in the first row it fits in. */
export function packRows<T extends { start: number; end: number }>(items: readonly T[], gap = 0): number[] {
  const ends: number[] = [];
  return items.map((item) => {
    let row = ends.findIndex((end) => end + gap <= item.start);
    if (row < 0) row = ends.length;
    ends[row] = item.end;
    return row;
  });
}

/** The pipeline stages in the order a reply goes through them. */
export const STAGE_ORDER: readonly SpanKind[] = ["eou", "stt", "llm", "tool", "tts", "playout"];

export interface PlacedSpan {
  span: TraceSpan;
  row: number;
  /** Where its first token or byte came, as a fraction of its length, when it says. */
  mark?: number;
}

/** Spans in rows. `kind`: a row per stage (end of turn, LLM, tool, TTS, playout), keeping only the
 * outermost span of each nest (`llm_node`, not the `llm_request` inside it) and marking where its
 * first token came. `depth`: every span, a row per level of nesting, overlaps packed. Session and
 * turn spans are the frame, not rows. */
export function layoutSpans(spans: readonly TraceSpan[], mode: "kind" | "depth" = "kind"): PlacedSpan[] {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const parentOfKind = (s: TraceSpan) => {
    for (
      let p = s.parentId ? byId.get(s.parentId) : undefined;
      p;
      p = p.parentId ? byId.get(p.parentId) : undefined
    )
      if (p.kind === s.kind) return p;
    return undefined;
  };
  const shown = spans.filter(
    (s) => s.kind !== "session" && s.kind !== "user_turn" && s.kind !== "agent_turn",
  );
  if (mode === "depth") {
    const depth = (s: TraceSpan) => {
      let d = 0;
      for (
        let p = s.parentId ? byId.get(s.parentId) : undefined;
        p;
        p = p.parentId ? byId.get(p.parentId) : undefined
      )
        if (p.kind !== "session") d++;
      return d;
    };
    const levels = new Map<number, TraceSpan[]>();
    for (const s of shown) levels.set(depth(s), [...(levels.get(depth(s)) ?? []), s]);
    const out: PlacedSpan[] = [];
    let base = 0;
    for (const d of [...levels.keys()].sort((a, b) => a - b)) {
      const level = levels.get(d)!.sort((a, b) => a.start - b.start);
      const rows = packRows(level);
      level.forEach((span, i) => out.push({ span, row: base + rows[i]! }));
      base += Math.max(...rows) + 1;
    }
    return out;
  }
  const rowOf = new Map(STAGE_ORDER.map((k, i) => [k, i]));
  return shown
    .filter((s) => rowOf.has(s.kind) && !parentOfKind(s))
    .map((span) => {
      const nested = spans.filter((s) => s.kind === span.kind && s !== span && isInside(s, span, byId));
      let mark: number | undefined;
      const first = [span, ...nested].find((s) => s.firstChunk !== undefined)?.firstChunk;
      if (first !== undefined && span.end > span.start)
        mark = Math.min(1, Math.max(0, (first - span.start) / (span.end - span.start)));
      return { span, row: rowOf.get(span.kind)!, ...(mark !== undefined && { mark }) };
    });
}

function isInside(s: TraceSpan, ancestor: TraceSpan, byId: ReadonlyMap<string, TraceSpan>): boolean {
  for (
    let p = s.parentId ? byId.get(s.parentId) : undefined;
    p;
    p = p.parentId ? byId.get(p.parentId) : undefined
  )
    if (p === ancestor) return true;
  return false;
}

export interface Cluster<T> {
  items: readonly T[];
  start: number;
  end: number;
}

/** Items merged where they'd sit closer than `minGap` pixels apart in a view `width` pixels
 * wide; each alone when zoomed in far enough. Items outside the view are left out. */
export function clusterByPixels<T extends { start: number; end?: number }>(
  items: readonly T[],
  view: View,
  width: number,
  minGap = 6,
): Cluster<T>[] {
  const span = view.to - view.from;
  if (span <= 0 || width <= 0) return [];
  const px = (t: number) => ((t - view.from) / span) * width;
  const out: { items: T[]; start: number; end: number }[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const end = item.end ?? item.start;
    if (end < view.from || item.start > view.to) continue;
    const last = out.at(-1);
    if (last && px(item.start) - px(last.start) < minGap) {
      last.items.push(item);
      last.end = Math.max(last.end, end);
    } else out.push({ items: [item], start: item.start, end });
  }
  return out;
}

/** The worst severity among findings (earshot/trace `worstSeverity`). */
export const worst = (findings: readonly Finding[]): Finding["severity"] => worstSeverity(findings);
