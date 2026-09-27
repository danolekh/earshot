"use client";
import {
  pageScheduler,
  resolveParams,
  type ShaderDefinition,
  type ShaderParamValue,
  type SurfaceHandle,
  type SurfaceStatus,
} from "@danolekh/gl";
import type * as React from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { AudioSource } from "../audio/source";
import { EN_LABELS, PlayerContext } from "../player/context";
import { usePrefersReducedMotion } from "../utils/media";
import { type PartProps, usePart } from "../utils/part";
import { useIsoLayoutEffect } from "../utils/use-iso-layout-effect";
import { ORB_INPUTS, type OrbDriver, createOrbDriver } from "./driver";
import { ORB } from "./presets";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface OrbContextValue {
  driver: OrbDriver;
  reducedMotion: boolean;
}

const OrbContext = createContext<OrbContextValue | null>(null);

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export interface OrbRootState extends Record<string, unknown> {
  state: OrbState;
}

export interface OrbRootProps extends PartProps<"div", OrbRootState> {
  /** What the agent is doing. The orb eases between states on a spring. */
  state: OrbState;
  /** The caller's microphone: moves the orb while it listens. */
  input?: AudioSource;
  /** The agent's voice: moves the orb while it speaks. */
  output?: AudioSource;
  /** Announces each change of state to screen readers ("Listening"). On by default. */
  announce?: boolean;
  /** How much it moves with the voice and at rest: 0.5 calm, 1 by default, up to 2 vivid. */
  liveliness?: number;
  /** Plays with the pointer: the highlight follows it, pressing squishes the orb, a tap sends a
   * ripple over it, a drag spins it. Decoration only: give it a role and a label if a click
   * should do something. Off by default. */
  interactive?: boolean;
  /** The state names it announces; the enclosing player's labels, else English. */
  stateLabels?: Record<OrbState, string>;
}

/** A voice agent's presence. Sets `data-state`, and every frame `--orb-level` (0..1, the loudness
 * of whoever is talking) and `--orb-idle`, `--orb-listening`, `--orb-thinking`, `--orb-speaking`
 * (each 0..1, easing between states), so CSS alone can animate it; `Orb.Shader` inside draws it
 * with WebGL. Renders a `<div>`. */
export function OrbRoot(props: OrbRootProps): React.ReactElement {
  const {
    state,
    input,
    output,
    announce = true,
    liveliness = 1,
    interactive = false,
    stateLabels,
    children,
    ...rest
  } = props;
  const player = useContext(PlayerContext);
  const labels = stateLabels ?? (player?.labels ?? EN_LABELS).states;
  const reducedMotion = usePrefersReducedMotion();
  const [driver] = useState(() => createOrbDriver());
  driver.configure({ state, input, output, reducedMotion, liveliness });
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let visible = true;
    const tick = () => {
      const v = driver.sample();
      el.style.setProperty("--orb-level", v.level.toFixed(3));
      for (const s of ["idle", "listening", "thinking", "speaking"] as const)
        el.style.setProperty(`--orb-${s}`, v[s].toFixed(3));
      raf = visible && document.visibilityState !== "hidden" ? requestAnimationFrame(tick) : 0;
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
            if (visible && !raf) raf = requestAnimationFrame(tick);
          });
    io?.observe(el);
    const wake = () => !raf && (raf = requestAnimationFrame(tick));
    document.addEventListener("visibilitychange", wake);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [driver]);

  const ctx = useMemo(() => ({ driver, reducedMotion }), [driver, reducedMotion]);
  const element = usePart(
    "orb",
    "div",
    { state },
    rest as PartProps<"div", OrbRootState>,
    {
      style: {
        position: "relative",
        "--orb-level": 0,
        ...(interactive && { cursor: "pointer", touchAction: "none" }),
      } as React.CSSProperties,
      ...(interactive && {
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => driver.interact({ type: "move", ...at(e) }),
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          driver.interact({ type: "down", ...at(e) });
        },
        onPointerUp: () => driver.interact({ type: "up" }),
        onPointerCancel: () => driver.interact({ type: "up" }),
        onPointerLeave: () => driver.interact({ type: "leave" }),
      }),
      children: (
        <>
          {children}
          {announce && (
            <span aria-live="polite" style={VISUALLY_HIDDEN}>
              {labels[state]}
            </span>
          )}
        </>
      ),
    },
    [ref as React.Ref<never>],
  );
  return <OrbContext.Provider value={ctx}>{element}</OrbContext.Provider>;
}

/** The pointer in the orb's own units: -1 to 1 across its box, y up. */
function at(e: React.PointerEvent<HTMLElement>): { x: number; y: number } {
  const box = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * 2 - 1;
  const y = 1 - ((e.clientY - box.top) / box.height) * 2;
  const r = Math.hypot(x, y);
  return r > 0.98 ? { x: (x / r) * 0.98, y: (y / r) * 0.98 } : { x, y };
}

export interface OrbShaderState extends Record<string, unknown> {
  /** Its first frame is drawn. */
  ready: boolean;
  /** No WebGL2 here, or the shader failed: show your fallback (CSS on `Orb.Root` still moves). */
  failed: boolean;
}

export interface OrbShaderProps extends PartProps<"canvas", OrbShaderState> {
  /** Your own shader reading the orb's inputs; earshot's orb (`ORB`) by default. */
  definition?: ShaderDefinition;
  /** Its parameters: for the orb, `colors` (top, middle, deep), `thinkingColor`, `glass`, `halo`. */
  params?: Readonly<Record<string, ShaderParamValue>>;
  /** The most device pixels per CSS pixel it draws; 2 by default. */
  maxDpr?: number;
  /** The most pixels its canvas holds, past which it draws smaller and scales up; 600 000 by
   * default. */
  maxPixels?: number;
}

// Fills the root, plus `--orb-bleed` on every side for the halo to glow past the orb's edge.
const FILL: React.CSSProperties = {
  position: "absolute",
  inset: "calc(-1 * var(--orb-bleed, 0px))",
  width: "calc(100% + 2 * var(--orb-bleed, 0px))",
  height: "calc(100% + 2 * var(--orb-bleed, 0px))",
  display: "block",
  pointerEvents: "none",
};

/** Draws the orb (a sphere of sky behind glass) with a WebGL2 shader, on the one context every earshot and cardstock shader on
 * the page shares. It fills `Orb.Root`, and `--orb-bleed` (a length, on the root) more on every
 * side, so the glow isn't clipped. A custom shader reads the driver's `uScale`, `uPhase`,
 * `uBright`, `uAura`, `uThink`, `uHue`, `uLevel` and the state weights. It fades in on its first frame; reduced motion
 * shows its still frame. Renders an `aria-hidden` `<canvas>`. */
export function OrbShader(props: OrbShaderProps): React.ReactElement {
  const { definition: given = ORB, params, maxDpr = 2, maxPixels = 600_000, ...rest } = props;
  const ctx = useContext(OrbContext);
  if (!ctx) throw new Error("earshot: <Orb.Shader> must be inside <Orb.Root>.");
  const { driver, reducedMotion } = ctx;
  const definition = useMemo(() => withOrbInputs(given), [given]);
  const uniforms = useMemo(() => resolveParams(definition, params), [definition, params]);
  const [status, setStatus] = useState<SurfaceStatus>({ ready: false, playing: false, failed: false });
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<SurfaceHandle | null>(null);
  const options = {
    definition,
    uniforms,
    speed: 1,
    state: reducedMotion ? ("still" as const) : ("play" as const),
    maxDpr,
    maxPixels,
  };
  const latest = useRef(options);
  useIsoLayoutEffect(() => {
    latest.current = options;
  });

  useIsoLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const values = Object.fromEntries(ORB_INPUTS.map((name) => [name, () => driver.sample()[name]]));
    const h = pageScheduler().add(canvas, latest.current, { values }, setStatus);
    handle.current = h;
    return () => {
      h.remove();
      handle.current = null;
    };
  }, [driver]);

  useIsoLayoutEffect(() => {
    handle.current?.update(latest.current);
  }, [definition, uniforms, reducedMotion, maxDpr, maxPixels]);

  return usePart(
    "orb-shader",
    "canvas",
    { ready: status.ready, failed: status.failed },
    rest as PartProps<"canvas", OrbShaderState>,
    {
      "aria-hidden": true,
      style: { ...FILL, opacity: status.ready ? 1 : 0, transition: "opacity 400ms ease" },
    },
    [ref as React.Ref<never>],
  );
}

const withInputs = new WeakMap<ShaderDefinition, ShaderDefinition>();

/** The definition with the orb's inputs declared, so a shader written without them still
 * compiles against the uniforms the orb sets. */
function withOrbInputs(definition: ShaderDefinition): ShaderDefinition {
  let d = withInputs.get(definition);
  if (!d) {
    const inputs = [...new Set([...(definition.inputs ?? []), ...ORB_INPUTS])];
    withInputs.set(definition, (d = { ...definition, inputs }));
  }
  return d;
}
