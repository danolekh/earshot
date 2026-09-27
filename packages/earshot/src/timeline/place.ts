/* Placing something in time on the timeline. `Timeline.Root` sets `--view-from` and `--view-span`
 * (fractions of the call; 0 and 1 when showing all of it), so zooming and panning move every part
 * through CSS alone, with no React render. */
import type * as React from "react";

const frac = (t: number, duration: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0);

/** `left` (and `width`, for a span) of something from `start` to `end` seconds, relative to the
 * view; plus `--x-start` / `--x-end` as fractions of the whole call, for skins. */
export function placeStyle(start: number, end: number | undefined, duration: number): React.CSSProperties {
  const a = frac(start, duration);
  const b = end === undefined ? undefined : frac(end, duration);
  return {
    "--x-start": a,
    ...(b !== undefined && { "--x-end": b }),
    left: `calc((${a} - var(--view-from, 0)) / var(--view-span, 1) * 100%)`,
    ...(b !== undefined && { width: `calc(${b - a} / var(--view-span, 1) * 100%)` }),
  } as React.CSSProperties;
}

/** `left` for a fraction of the call held in a CSS variable (the playhead, the skimmer). */
export const placeVar = (name: string): string =>
  `calc((var(${name}) - var(--view-from, 0)) / var(--view-span, 1) * 100%)`;

/** How tall a lane is: at least `height` (CSS), growing by `grow` shares of the room the timeline
 * has beyond every lane's height, up to `max`. */
export interface LaneSize {
  height: string;
  grow?: number;
  max?: string;
}

/** A lane's box as a flex item of a column: the same for `Timeline.Lane` and anything that must
 * line up with it (a gutter of labels beside the timeline), so they can't drift apart. */
export const laneStyle = (size: LaneSize): React.CSSProperties => ({
  flex: `${size.grow ?? 0} 0 ${size.height}`,
  minHeight: size.height,
  ...(size.max && { maxHeight: size.max }),
});
