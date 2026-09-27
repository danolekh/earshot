/* What draws a lane: a renderer given the view, the time and the canvas size, which it may skip
 * when nothing it shows changed. The canvas is as wide as the view, never the whole call (a
 * zoomed-in 30-minute call would pass browsers' canvas limits), and redraws only on a change of
 * view, size, style or, when it shows progress, time. A WebGL renderer would plug in here: one
 * whose `attach` fails leaves the canvas empty rather than breaking the timeline. */

import type { Clock } from "../core/clock";
import type { View } from "./viewport";

export interface LaneFrame {
  view: View;
  time: number;
  duration: number;
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
}

export interface LaneRenderer {
  /** Sets up on a canvas; false when it can't (no context), and nothing is drawn. */
  attach(canvas: HTMLCanvasElement): boolean;
  /** Takes colours and sizes from the canvas's computed style. */
  restyle(style: CSSStyleDeclaration): void;
  /** Whether `next` looks different from `prev` (defaults to: anything changed). */
  dirty?(prev: LaneFrame, next: LaneFrame): boolean;
  draw(frame: LaneFrame): void;
  dispose?(): void;
}

/** Anything that holds a view and says when it changes. */
export interface ViewSource {
  get(): View;
  subscribe(listener: () => void): () => void;
}

/** Device pixels the canvas may have: dpr at most 2, width at most 4096 (iOS's limit). */
export function canvasScale(width: number, height: number, devicePixelRatio: number): number {
  const dpr = Math.min(2, devicePixelRatio || 1);
  return Math.max(0.1, Math.min(dpr, 4096 / Math.max(1, width), 4096 / Math.max(1, height)));
}

const sameFrame = (a: LaneFrame, b: LaneFrame) =>
  a.view.from === b.view.from &&
  a.view.to === b.view.to &&
  a.time === b.time &&
  a.width === b.width &&
  a.height === b.height &&
  a.dpr === b.dpr &&
  a.duration === b.duration;

/** Keeps a renderer drawing a canvas: sized to its box, restyled when a theme or skin changes on an
 * ancestor, redrawn when the view (and, with `followTime`, the clock) moves. Returns the cleanup. */
export function driveLane(
  canvas: HTMLCanvasElement,
  renderer: LaneRenderer,
  sources: { clock: Clock; view: ViewSource; duration: number; followTime: boolean },
): () => void {
  if (!renderer.attach(canvas)) return () => renderer.dispose?.();
  let size = { width: 0, height: 0, dpr: 1 };
  let last: LaneFrame | null = null;
  const measure = () => {
    renderer.restyle(getComputedStyle(canvas));
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = canvasScale(width, height, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    size = { width, height, dpr };
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    last = null;
  };
  const draw = () => {
    if (!size.width || !size.height) return;
    const frame: LaneFrame = {
      view: sources.view.get(),
      time: sources.followTime ? sources.clock.time() : 0,
      duration: sources.duration,
      ...size,
    };
    if (last && (renderer.dirty ? !renderer.dirty(last, frame) : sameFrame(last, frame))) return;
    last = frame;
    renderer.draw(frame);
  };
  measure();
  draw();
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => (measure(), draw()));
  ro?.observe(canvas);
  const restyle = () => (measure(), draw());
  const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(restyle);
  for (let el: Element | null = canvas.parentElement; el; el = el.parentElement)
    mo?.observe(el, { attributes: true, attributeFilter: ["class", "data-skin", "data-theme"] });
  const offView = sources.view.subscribe(draw);
  const offClock = sources.followTime ? sources.clock.subscribe(draw) : () => {};
  return () => {
    offView();
    offClock();
    ro?.disconnect();
    mo?.disconnect();
    renderer.dispose?.();
  };
}
