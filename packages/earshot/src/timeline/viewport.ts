/* The part of the call the timeline shows, framework-free: zoom around a moment (it stays under the
 * pointer), pan, fit, page to keep the playhead in view, and the ruler's ticks. Times in seconds. */

export interface View {
  from: number;
  to: number;
}

export interface Viewport {
  get(): View;
  duration(): number;
  set(view: View): void;
  /** `factor` < 1 zooms in, > 1 out; `anchor` (seconds) stays where it is on screen. */
  zoom(factor: number, anchor: number): void;
  /** Moves the view by `by` seconds. */
  pan(by: number): void;
  /** Shows the whole call. */
  fit(): void;
  /** Pages the view so `t` is in it, keeping its width; no motion. */
  reveal(t: number): void;
  setDuration(duration: number): void;
  subscribe(listener: () => void): () => void;
}

/** A view inside `[0, duration]`, at least `minSpan` wide. */
export function clampView(view: View, duration: number, minSpan: number): View {
  const span = Math.min(duration, Math.max(minSpan, view.to - view.from));
  const from = Math.min(Math.max(0, view.from), Math.max(0, duration - span));
  return { from, to: from + span };
}

/** `view` zoomed by `factor` around `anchor`, which keeps its place on screen. */
export function zoomView(
  view: View,
  factor: number,
  anchor: number,
  duration: number,
  minSpan: number,
): View {
  const span = view.to - view.from;
  const at = span > 0 ? (anchor - view.from) / span : 0.5;
  const next = Math.min(duration, Math.max(minSpan, span * factor));
  return clampView({ from: anchor - at * next, to: anchor - at * next + next }, duration, minSpan);
}

export const isFullView = (view: View, duration: number): boolean =>
  view.from <= 1e-9 && view.to >= duration - 1e-9;

/** A view around an interval with room either side: `share` of its length, at least `min`
 * seconds (a finding, a turn, a cluster of markers zoomed to). The viewport clamps it. */
export function viewAround(
  interval: { start: number; end: number },
  options: { share?: number; min?: number } = {},
): View {
  const pad = Math.max(
    options.min ?? 0.4,
    Math.max(0, interval.end - interval.start) * (options.share ?? 0.25),
  );
  return { from: interval.start - pad, to: interval.end + pad };
}

export function createViewport(
  duration: number,
  options: { minSpan?: number; initial?: View } = {},
): Viewport {
  const minSpan = options.minSpan ?? 0.5;
  let total = Math.max(duration, 0.001);
  let view = clampView(options.initial ?? { from: 0, to: total }, total, Math.min(minSpan, total));
  const listeners = new Set<() => void>();
  const set = (next: View) => {
    const v = clampView(next, total, Math.min(minSpan, total));
    if (v.from === view.from && v.to === view.to) return;
    view = v;
    listeners.forEach((l) => l());
  };
  return {
    get: () => view,
    duration: () => total,
    set,
    zoom: (factor, anchor) => set(zoomView(view, factor, anchor, total, Math.min(minSpan, total))),
    pan: (by) => set({ from: view.from + by, to: view.to + by }),
    fit: () => set({ from: 0, to: total }),
    reveal(t) {
      const span = view.to - view.from;
      if (t >= view.from && t <= view.to) return;
      set({ from: t - span * 0.1, to: t - span * 0.1 + span });
    },
    setDuration(d) {
      const full = isFullView(view, total);
      total = Math.max(d, 0.001);
      set(full ? { from: 0, to: total } : view);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Ruler ticks for a view `width` pixels wide: the smallest round step that keeps labels at least
 * `minGap` pixels apart, and the times of the ticks in view. */
export function ticks(view: View, width: number, minGap = 64): { step: number; times: number[] } {
  const span = view.to - view.from;
  if (span <= 0 || width <= 0) return { step: 1, times: [] };
  const step = STEPS.find((s) => (s / span) * width >= minGap) ?? STEPS.at(-1)!;
  const times: number[] = [];
  for (let t = Math.ceil(view.from / step - 1e-9) * step; t <= view.to + 1e-9; t += step)
    times.push(Math.round(t * 1000) / 1000);
  return { step, times };
}
