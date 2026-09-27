"use client";
import type * as React from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import type { AudioSource } from "../audio/source";
import { usePrefersReducedMotion } from "../utils/media";
import { type PartProps, usePart } from "../utils/part";
import { approach, createVisualizerEngine, type VisualizerState } from "./engine";

interface VisualizerContextValue {
  source: AudioSource | null | undefined;
  state: VisualizerState | undefined;
  reduced: boolean;
  bars: number;
  mirror: boolean;
  /** Called every frame with the seconds since the last, while the root is in view. */
  subscribe(tick: (dt: number) => void): () => void;
}

const VisualizerContext = createContext<VisualizerContextValue | null>(null);

function useVisualizer(part: string): VisualizerContextValue {
  const ctx = useContext(VisualizerContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <Visualizer.Root>.`);
  return ctx;
}

export interface VisualizerRootState extends Record<string, unknown> {
  /** There is sound: the source is louder than a whisper. */
  active: boolean;
  state: VisualizerState | "none";
}

export interface VisualizerRootProps extends PartProps<"div", VisualizerRootState> {
  source: AudioSource | null | undefined;
  /** What the agent is doing. With no voice to show, each state has its own motion: thinking
   * sweeps, listening breathes, idle rests. */
  state?: VisualizerState;
  /** How many `Visualizer.Bars`; 5 by default. */
  bars?: number;
  /** Mirrors the bands around the middle, the voice-assistant look. On by default. */
  mirror?: boolean;
}

/** Visuals that move with a voice, drawn by your CSS. Holds the source and one animation loop for
 * the variants inside: `Visualizer.Bars` (DOM bars), `Visualizer.History` (a scrolling waveform),
 * `Visualizer.Radial` (bars round a circle) and `Visualizer.Matrix` (a dot grid). Sets the overall
 * `--vx-level` and `data-active`; nothing re-renders as it moves. Hidden from screen readers.
 * Renders a `<div>`. */
export function VisualizerRoot(props: VisualizerRootProps): React.ReactElement {
  const { source, state, bars = 5, mirror = true, children, ...rest } = props;
  const reduced = usePrefersReducedMotion();
  const root = useRef<HTMLElement>(null);
  const ticks = useRef(new Set<(dt: number) => void>());
  const live = useRef({ source, state });
  useEffect(() => {
    live.current = { source, state };
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    let visible = true;
    let level = 0;
    let active = false;
    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const heard = live.current.source?.level() ?? 0;
      level = approach(level, heard, 0.5, 0.12, dt);
      el.style.setProperty("--vx-level", (reduced ? 0 : level).toFixed(3));
      if (heard > 0.04 !== active) {
        active = heard > 0.04;
        el.toggleAttribute("data-active", active);
      }
      ticks.current.forEach((t) => t(dt));
      if (visible && document.visibilityState !== "hidden") raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => {
      if (!raf && visible && document.visibilityState !== "hidden") raf = requestAnimationFrame(tick);
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
            wake();
          });
    io?.observe(el);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [reduced]);

  const ctx = useMemo<VisualizerContextValue>(
    () => ({
      get source() {
        return live.current.source;
      },
      get state() {
        return live.current.state;
      },
      reduced,
      bars,
      mirror,
      subscribe(t) {
        ticks.current.add(t);
        return () => ticks.current.delete(t);
      },
    }),
    [reduced, bars, mirror],
  );

  const element = usePart(
    "visualizer",
    "div",
    { active: false, state: state ?? "none" },
    rest as PartProps<"div", VisualizerRootState>,
    {
      "aria-hidden": true,
      children: children ?? <VisualizerBars />,
      style: { "--vx-level": 0 } as React.CSSProperties,
    },
    [root as React.Ref<never>],
  );
  return <VisualizerContext.Provider value={ctx}>{element}</VisualizerContext.Provider>;
}

const BarsContext = createContext<((index: number, el: HTMLElement | null) => void) | null>(null);

export interface VisualizerBarsProps {
  children?: React.ReactNode;
}

/** The root's bars: renders a `Visualizer.Bar` for each (or your own, given as children) and
 * sets every bar's `--vx-level` and held `--vx-peak` (0 to 1) each frame. */
export function VisualizerBars(props: VisualizerBarsProps): React.ReactElement {
  const ctx = useVisualizer("Visualizer.Bars");
  const elements = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const engine = createVisualizerEngine({ bands: ctx.bars, mirror: ctx.mirror, floor: 0.06, hold: 0.4 });
    return ctx.subscribe((dt) => {
      const f = engine.step(ctx.source, ctx.state, dt, ctx.reduced);
      elements.current.forEach((el, i) => {
        el?.style.setProperty("--vx-level", f.levels[i]!.toFixed(3));
        el?.style.setProperty("--vx-peak", f.peaks[i]!.toFixed(3));
      });
    });
  }, [ctx]);
  const register = useMemo(
    () => (index: number, el: HTMLElement | null) => {
      elements.current[index] = el;
    },
    [],
  );
  return (
    <BarsContext.Provider value={register}>
      {props.children ?? Array.from({ length: ctx.bars }, (_, i) => <VisualizerBar key={i} index={i} />)}
    </BarsContext.Provider>
  );
}

export interface VisualizerBarState extends Record<string, unknown> {
  index: number;
}

export interface VisualizerBarProps extends PartProps<"div", VisualizerBarState> {
  index: number;
}

/** A bar: style its height (or `scaleY`, or opacity) from `--vx-level`, and a cap from
 * `--vx-peak`. Renders a `<div>`. */
export function VisualizerBar(props: VisualizerBarProps): React.ReactElement {
  const { index, ...rest } = props;
  const register = useContext(BarsContext);
  if (!register) throw new Error("earshot: <Visualizer.Bar> must be inside <Visualizer.Bars>.");
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    register(index, ref.current);
    return () => register(index, null);
  }, [register, index]);
  return usePart(
    "visualizer-bar",
    "div",
    { index },
    rest as PartProps<"div", VisualizerBarState>,
    { style: { "--vx-level": 0, "--vx-peak": 0 } as React.CSSProperties },
    [ref as React.Ref<never>],
  );
}

/** A canvas sized to its box at the device's pixel ratio (up to 2), redrawn by `draw` on every
 * frame the root runs; its colours come from CSS. */
function useCanvas(
  ctx: VisualizerContextValue,
  draw: (g: CanvasRenderingContext2D, box: { w: number; h: number }, style: CanvasStyle, dt: number) => void,
  deps: React.DependencyList,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    let box = { w: 0, h: 0 };
    let style: CanvasStyle = { color: "#888", dim: "rgba(136,136,136,.18)" };
    const measure = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      box = { w: canvas.clientWidth, h: canvas.clientHeight };
      canvas.width = Math.max(1, Math.round(box.w * dpr));
      canvas.height = Math.max(1, Math.round(box.h * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = getComputedStyle(canvas);
      style = { color: s.color, dim: s.getPropertyValue("--vx-dim").trim() || s.color };
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(canvas);
    const off = ctx.subscribe((dt) => {
      g.clearRect(0, 0, box.w, box.h);
      draw(g, box, style, dt);
    });
    return () => {
      off();
      ro?.disconnect();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `draw` is rebuilt from `deps`
  }, [ctx, ...deps]);
  return ref;
}

interface CanvasStyle {
  /** The canvas's CSS `color`: lit bars. */
  color: string;
  /** `--vx-dim`: unlit dots, the resting baseline; the color at low opacity by default. */
  dim: string;
}

const round = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, Math.min(w, h) / 2);
  else g.rect(x, y, w, h);
  g.fill();
};

export interface VisualizerHistoryProps extends PartProps<"canvas", { state: string }> {
  /** Bar width and gap, in CSS pixels; 2 and 2 by default. */
  bar?: number;
  gap?: number;
  /** Seconds between samples; 0.05 by default (20 bars a second). */
  every?: number;
}

/** A scrolling waveform: the last few seconds of the voice as mirrored, rounded bars gliding right
 * to left, newest at the right, silence as a row of dots (Voice Memos). Bars take the canvas's CSS
 * `color`; fade its edges with a CSS mask. Renders a `<canvas>`. */
export function VisualizerHistory(props: VisualizerHistoryProps): React.ReactElement {
  const { bar = 2, gap = 2, every = 0.05, ...rest } = props;
  const samples = useRef<number[]>([]);
  const since = useRef(0);
  const clock = useRef(0);
  const ctx = useVisualizer("Visualizer.History");
  const ref = useCanvas(
    ctx,
    (g, { w, h }, style, dt) => {
      const step = bar + gap;
      const keep = Math.ceil(w / step) + 2;
      clock.current += dt;
      since.current += dt;
      if (since.current >= every) {
        since.current %= every;
        let v = ctx.source?.level() ?? 0;
        // Thinking with no voice: the dots breathe, so the strip shows it's working.
        if (v < 0.04 && ctx.state === "thinking") v = 0.08 + 0.06 * Math.sin(clock.current * 5.2);
        samples.current.push(ctx.reduced ? 0 : v);
        while (samples.current.length > keep) samples.current.shift();
      }
      const glide = ctx.reduced ? 0 : (since.current / every) * step;
      const n = samples.current.length;
      g.fillStyle = style.color;
      for (let i = 0; i < n; i++) {
        const v = samples.current[i]!;
        const newest = i === n - 1;
        const grow = newest && !ctx.reduced ? Math.min(1, since.current / 0.12) : 1;
        const bh = Math.max(bar, v * h * 0.92 * grow);
        const x = w - (n - i) * step - glide + gap;
        g.globalAlpha = v < 0.04 ? 0.45 : 1;
        round(g, x, (h - bh) / 2, bar, bh);
      }
      g.globalAlpha = 1;
    },
    [bar, gap, every],
  );
  return usePart(
    "visualizer-history",
    "canvas",
    { state: ctx.state ?? "none" },
    rest as PartProps<"canvas", { state: string }>,
    { style: { display: "block", width: "100%" } },
    [ref as React.Ref<never>],
  );
}

export interface VisualizerRadialProps extends PartProps<"canvas", { state: string }> {
  /** How many bars round the circle; 48 by default. */
  count?: number;
  /** Where the bars start, as a fraction of the canvas's half-width; 0.6 by default (room for an
   * orb inside). */
  inner?: number;
  /** How far the loudest bar reaches, as a fraction of the half-width; 0.32 by default. */
  reach?: number;
}

/** Bars round a circle, mirrored left and right, lengths easing, brighter the longer
 * they are; thinking sends a crest round, listening breathes. Put an `Orb` in the middle. Bars
 * take the canvas's CSS `color`. Renders a `<canvas>`. */
export function VisualizerRadial(props: VisualizerRadialProps): React.ReactElement {
  const { count = 48, inner = 0.6, reach = 0.32, ...rest } = props;
  const engine = useMemo(
    () => createVisualizerEngine({ bands: count, mirror: true, floor: 0.05, hold: 0.3 }),
    [count],
  );

  const ctx = useVisualizer("Visualizer.Radial");
  const ref = useCanvas(
    ctx,
    (g, { w, h }, style, dt) => {
      const f = engine.step(ctx.source, ctx.state, dt, ctx.reduced);
      const half = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      const thick = Math.max(2, (2 * Math.PI * half * inner) / count / 2.4);
      g.strokeStyle = style.color;
      g.lineCap = "round";
      g.lineWidth = thick;
      for (let i = 0; i < count; i++) {
        // Index 0 at the bottom, so the mirrored halves meet top and bottom.
        const a = Math.PI / 2 + (i / count) * Math.PI * 2;
        const v = f.levels[i]!;
        const r0 = half * inner;
        const r1 = r0 + half * reach * v + thick * 0.2;
        g.globalAlpha = 0.35 + 0.65 * Math.min(1, v * 1.6);
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    [engine, inner, reach],
  );
  return usePart(
    "visualizer-radial",
    "canvas",
    { state: ctx.state ?? "none" },
    rest as PartProps<"canvas", { state: string }>,
    // Square; its size is yours (a class or style), so no width here to override it.
    { style: { display: "block", aspectRatio: "1" } },
    [ref as React.Ref<never>],
  );
}

export interface VisualizerMatrixProps extends PartProps<"canvas", { state: string }> {
  /** Grid size; 5 rows by 9 columns by default. */
  rows?: number;
  columns?: number;
}

/** A dot grid: each column lights from the middle out with its band, its top dot holding a
 * moment before it falls; thinking sweeps across. Lit dots take the canvas's CSS `color`, unlit
 * ones `--vx-dim`. Renders a `<canvas>`. */
export function VisualizerMatrix(props: VisualizerMatrixProps): React.ReactElement {
  const { rows = 5, columns = 9, ...rest } = props;
  const engine = useMemo(
    () => createVisualizerEngine({ bands: columns, mirror: true, floor: 0, hold: 0.4 }),
    [columns],
  );
  const ctx = useVisualizer("Visualizer.Matrix");
  const ref = useCanvas(
    ctx,
    (g, { w, h }, style, dt) => {
      const f = engine.step(ctx.source, ctx.state, dt, ctx.reduced);
      const cell = Math.min(w / columns, h / rows);
      const dot = cell * 0.5;
      const ox = (w - cell * columns) / 2;
      const oy = (h - cell * rows) / 2;
      const mid = (rows - 1) / 2;
      for (let c = 0; c < columns; c++) {
        const lit = f.levels[c]! * (rows / 2 + 0.5);
        const peak = Math.round(f.peaks[c]! * (rows / 2 + 0.5));
        for (let r = 0; r < rows; r++) {
          const d = Math.abs(r - mid);
          const on = d < lit;
          const held = !on && Math.ceil(d) === peak && peak > 0;
          g.fillStyle = on || held ? style.color : style.dim;
          g.globalAlpha = on ? 1 : held ? 0.6 : style.dim === style.color ? 0.14 : 1;
          const x = ox + c * cell + (cell - dot) / 2;
          const y = oy + r * cell + (cell - dot) / 2;
          round(g, x, y, dot, dot);
        }
      }
      g.globalAlpha = 1;
    },
    [engine, rows, columns],
  );
  return usePart(
    "visualizer-matrix",
    "canvas",
    { state: ctx.state ?? "none" },
    rest as PartProps<"canvas", { state: string }>,
    { style: { display: "block", width: "100%" } },
    [ref as React.Ref<never>],
  );
}
