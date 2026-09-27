"use client";
import { spring } from "math/time";
import type * as React from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { audible } from "../audio/listen";
import type { Clock } from "../core/clock";
import {
  formatTime,
  eventsIn,
  measureLatency,
  overlaps,
  peaksFor,
  spokenUntil,
  turnAt,
} from "../core/conversation";
import { peaksFromWords } from "../core/peaks";
import type { PeakPyramid } from "../core/pyramid";
import type { Conversation, ConversationEvent, Peaks, Role, Turn } from "../core/types";
import {
  describeEvent,
  PlayerContext,
  type PlayerLabels,
  useClockValue,
  usePlayer,
  useSelected,
} from "../player/context";
import { usePrefersReducedMotion } from "../utils/media";
import { type PartProps, usePart } from "../utils/part";
import { useIsoLayoutEffect } from "../utils/use-iso-layout-effect";
import { createWaveformRenderer } from "./canvas2d";
import { applyKeyAction, type KeyAction, type Mark, scrubberKey } from "./keys";
import { type LaneSize, laneStyle, placeStyle, placeVar } from "./place";
import { driveLane } from "./renderer";
import { createViewport, isFullView, ticks, type Viewport } from "./viewport";

export interface TimelineContextValue {
  conversation: Conversation;
  clock: Clock;
  labels: PlayerLabels;
  /** The whole call, in seconds. */
  duration: number;
  /** The part of it shown: all of it unless zoomed. */
  viewport: Viewport;
  /** The time under the pointer while it hovers the scrubber, for the skimmer. */
  skim: SkimStore;
}

interface SkimStore {
  get(): number | null;
  set(t: number | null): void;
  subscribe(listener: () => void): () => void;
}

function createSkimStore(): SkimStore {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(t) {
      if (t === value) return;
      value = t;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const TimelineContext = createContext<TimelineContextValue | null>(null);
const LaneContext = createContext<Role | null>(null);

/** The timeline around a part; throws outside one, naming the part. For parts built elsewhere
 * (trace lanes). */
export function useTimeline(part: string): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <Timeline.Root>.`);
  return ctx;
}

const frac = (t: number, duration: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0);

export interface TimelineRootState extends Record<string, unknown> {
  playing: boolean;
  /** Showing part of the call. */
  zoomed: boolean;
}

export interface TimelineRootProps extends PartProps<"div", TimelineRootState> {
  /** What part of the call to show, when you want to zoom from outside (keys, a minimap, the URL);
   * `Timeline.Scrubber zoom` zooms without one. */
  viewport?: Viewport;
  /** While playing, page the view along so the playhead stays in it. */
  follow?: boolean;
  /** Page the view to the playhead after a seek (while paused, or a jump of over a second while
   * playing), so a click in a transcript or a list lands in view. On by default. */
  reveal?: boolean;
}

/** The call laid out in time, inside a `Player.Root`. Sets `--timeline-progress` (0..1) on itself
 * every frame, which `Timeline.Playhead` and your own CSS can use; nothing re-renders as it moves.
 * Zoomed in, it sets `--view-from` and `--view-span` (fractions of the call) and every part
 * places itself against them, also without re-rendering; clip the lanes in your CSS. Renders a
 * `<div>`. */
export function TimelineRoot(props: TimelineRootProps): React.ReactElement {
  const { viewport: given, follow = false, reveal = true, ...rest } = props;
  const { conversation, clock, labels } = usePlayer("Timeline.Root");
  const duration = Math.max(conversation.duration, 0.001);
  const [skim] = useState(createSkimStore);
  const [own] = useState(() => createViewport(duration));
  const viewport = given ?? own;
  useEffect(() => viewport.setDuration(duration), [viewport, duration]);
  const ctx = useMemo(
    () => ({ conversation, clock, labels, duration, skim, viewport }),
    [conversation, clock, labels, duration, skim, viewport],
  );
  const playing = useClockValue(clock, (c) => c.playing(), false);
  const zoomed = useSyncExternalStore(
    viewport.subscribe,
    () => !isFullView(viewport.get(), duration),
    () => false,
  );
  const ref = useRef<HTMLElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => el.style.setProperty("--timeline-progress", String(frac(clock.time(), duration)));
    const view = () => {
      const v = viewport.get();
      el.style.setProperty("--view-from", String(v.from / duration));
      el.style.setProperty("--view-span", String((v.to - v.from) / duration));
    };
    set();
    view();
    let last = clock.time();
    const offClock = clock.subscribe(() => {
      set();
      const now = clock.time();
      if (follow && clock.playing()) viewport.reveal(now);
      else if (reveal && (clock.playing() ? Math.abs(now - last) > 1 : now !== last)) viewport.reveal(now);
      last = now;
    });
    const offView = viewport.subscribe(view);
    return () => {
      offClock();
      offView();
    };
  }, [clock, duration, viewport, follow, reveal]);
  const element = usePart(
    "timeline",
    "div",
    { playing, zoomed },
    rest as PartProps<"div", TimelineRootState>,
    { style: { "--timeline-progress": 0, "--view-from": 0, "--view-span": 1 } as React.CSSProperties },
    [ref as React.Ref<never>],
  );
  return <TimelineContext.Provider value={ctx}>{element}</TimelineContext.Provider>;
}

export interface TimelineScrubberState extends Record<string, unknown> {
  /** Being dragged. */
  scrubbing: boolean;
  playing: boolean;
}

export interface TimelineScrubberProps extends PartProps<"div", TimelineScrubberState> {
  /** Ctrl/Cmd + wheel or a pinch zooms at the pointer; Shift + wheel or a sideways swipe pans; W and
   * S (or + and -) zoom at the playhead, A and D pan, 0 shows the whole call. */
  zoom?: boolean;
  /** What screen readers hear for the position, given the time and the default text. */
  valueText?: (time: number, text: string) => string;
  /** The moments `[` `]` hop between (default: every event), and the ones Shift+`[` `]` do (default:
   * failed judges): times, or marks with ids (a seek to one says which). */
  marks?: readonly (number | Mark)[];
  failures?: readonly (number | Mark)[];
  /** Handles a key's action yourself (a hop to a mark that also picks it, say): called in place of
   * the default (`applyKeyAction`), which you can still call. The key's default is prevented
   * either way, so a handler further up can tell it was taken. */
  onKeyAction?: (action: Exclude<KeyAction, null>, event: React.KeyboardEvent<HTMLElement>) => void;
}

/** The track you drag, click or key through: a `role="slider"` over the call. Dragging shows the
 * moment live, never seek-on-release. Keys: arrows a word (Shift 5 s, Alt a turn), Page Up/Down a
 * turn, `[` `]` the previous or next marker (Shift: failed judge), J and L 10 s, Home and End,
 * Space or K to play, `,` `.` for speed. It names the moment it's at ("0:12 of 2:30, Agent: ..."),
 * so the waveform, lanes and markers inside it are presentational. Hovering feeds
 * `Timeline.Skimmer` and never seeks. Renders a `<div>`. */
export function TimelineScrubber(props: TimelineScrubberProps): React.ReactElement {
  const { zoom = false, valueText, marks, failures, onKeyAction, ...rest } = props;
  const { conversation, clock, labels, duration, skim, viewport } = useTimeline("Timeline.Scrubber");
  const [scrubbing, setScrubbing] = useState(false);
  const playing = useClockValue(clock, (c) => c.playing(), false);
  const second = useClockValue(clock, (c) => Math.floor(c.time()), 0);
  const speaking = useClockValue(clock, (c) => turnAt(conversation, c.time())?.id, undefined);
  const turn = speaking ? conversation.turns.find((t) => t.id === speaking) : undefined;
  const who = turn ? `, ${turn.speaker ?? labels.roles[turn.role]}: ${turn.text.slice(0, 80)}` : "";
  const ref = useRef<HTMLElement>(null);

  const timeAt = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !box.width) return null;
    const v = viewport.get();
    return v.from + frac((clientX - box.left) / box.width, 1) * (v.to - v.from);
  };

  // Wheel zoom and pan: a non-passive listener, so the page doesn't scroll under a pinch.
  useEffect(() => {
    const el = ref.current;
    if (!el || !zoom) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewport.get();
      const box = el.getBoundingClientRect();
      if (!box.width) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const anchor = v.from + frac((e.clientX - box.left) / box.width, 1) * (v.to - v.from);
        viewport.zoom(Math.exp(e.deltaY * 0.01), anchor);
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const px = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        viewport.pan((px / box.width) * (v.to - v.from));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, viewport]);
  const seekTo = (clientX: number) => {
    const t = timeAt(clientX);
    if (t !== null) clock.seek(t);
  };

  const text = labels.positionText(formatTime(second), formatTime(duration)) + who;
  return usePart(
    "timeline-scrubber",
    "div",
    { scrubbing, playing },
    rest as PartProps<"div", TimelineScrubberState>,
    {
      role: "slider",
      tabIndex: 0,
      "aria-label": labels.position,
      "aria-valuemin": 0,
      "aria-valuemax": Math.floor(duration),
      "aria-valuenow": second,
      "aria-valuetext": valueText ? valueText(second, text) : text,
      style: { position: "relative", touchAction: "none", userSelect: "none" },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setScrubbing(true);
        seekTo(e.clientX);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
        if (e.pointerType === "mouse") skim.set(timeAt(e.clientX));
      },
      onPointerLeave: () => skim.set(null),
      onPointerUp: () => setScrubbing(false),
      onPointerCancel: () => setScrubbing(false),
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        const action = scrubberKey(conversation, clock.time(), e, {
          ...(marks && { marks }),
          ...(failures && { failures }),
          ...(zoom && { view: viewport.get() }),
        });
        if (!action) return;
        e.preventDefault();
        if (onKeyAction) onKeyAction(action, e);
        else applyKeyAction(action, { clock, viewport, duration });
      },
    },
    [ref as React.Ref<never>],
  );
}

export interface TimelinePlayheadProps extends PartProps<"div", TimelineScrubberState> {}

/** A line at the playback position: `left` follows `--timeline-progress`. After a seek it glides
 * there on a spring instead of jumping (it jumps under reduced motion). Renders a `<div>`. */
export function TimelinePlayhead(props: TimelinePlayheadProps): React.ReactElement {
  const { clock, duration } = useTimeline("Timeline.Playhead");
  const playing = useClockValue(clock, (c) => c.playing(), false);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);

  // While playing it tracks the clock exactly; a seek springs it over, so the eye follows the jump.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const state = spring.create(frac(clock.time(), duration));
    let raf = 0;
    let last = 0;
    let target = state.value;
    const draw = () => el.style.setProperty("--playhead", String(state.value));
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      spring.damp(state, target, 0.09, dt);
      if (Math.abs(state.value - target) < 1e-4 && Math.abs(state.velocity) < 1e-3) {
        state.value = target;
        state.velocity = 0;
        raf = 0;
        last = 0;
      } else raf = requestAnimationFrame(tick);
      draw();
    };
    const off = clock.subscribe(() => {
      const next = frac(clock.time(), duration);
      const jumped = Math.abs(next - target) * duration > 0.5;
      target = next;
      if (reduced || (!jumped && !raf)) {
        state.value = next;
        state.velocity = 0;
        draw();
      } else if (!raf) raf = requestAnimationFrame(tick);
    });
    draw();
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [clock, duration, reduced]);

  return usePart(
    "timeline-playhead",
    "div",
    { scrubbing: false, playing },
    props as PartProps<"div", TimelineScrubberState>,
    {
      "aria-hidden": true,
      style: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: placeVar("--playhead, var(--timeline-progress)"),
        pointerEvents: "none",
      },
    },
    [ref as React.Ref<never>],
  );
}

export interface TimelineLaneState extends Record<string, unknown> {
  speaker: Role | "all";
  /** Its speaker can't be heard (muted, or another side soloed on the player). */
  muted: boolean;
}

export interface TimelineLaneProps extends PartProps<"div", TimelineLaneState> {
  /** Whose turns it holds (`"agent"`, `"user"`); every turn when left out. */
  speaker?: Role;
  /** How tall it is, as a flex item of a column of lanes (`laneStyle`, which a gutter of labels can
   * share so they line up). */
  size?: LaneSize;
}

/** Whether a lane's speaker can't be heard: false without a speaker, or without a player's
 * channels for it. */
function useLaneMuted(role: Role | undefined): boolean {
  const player = useContext(PlayerContext);
  return useSyncExternalStore(
    player?.listening.subscribe ?? NO_SUBSCRIBE,
    () => !!role && !!player && player.channels.includes(role) && !audible(player.listening.get(), role),
    () => false,
  );
}
const NO_SUBSCRIBE = () => () => {};

/** A row of one speaker's turns. Put `Timeline.Segments` (or your own `Timeline.Segment`s)
 * inside. `data-muted` when its speaker can't be heard. Renders a `<div>`. */
export function TimelineLane(props: TimelineLaneProps): React.ReactElement {
  const { speaker: role, size, ...rest } = props;
  const muted = useLaneMuted(role);
  const element = usePart(
    "timeline-lane",
    "div",
    { speaker: role ?? "all", muted },
    rest as PartProps<"div", TimelineLaneState>,
    {
      style: { position: "relative", ...(size && laneStyle(size)) },
    },
  );
  return <LaneContext.Provider value={role ?? null}>{element}</LaneContext.Provider>;
}

export interface TimelineSegmentsProps {
  children?: (turn: Turn) => React.ReactNode;
}

/** The lane's turns, a `Timeline.Segment` each. */
export function TimelineSegments(props: TimelineSegmentsProps): React.ReactElement {
  const { conversation } = useTimeline("Timeline.Segments");
  const role = useContext(LaneContext);
  const turns = conversation.turns.filter((t) => !role || t.role === role);
  return (
    <>{turns.map((t) => (props.children ? props.children(t) : <TimelineSegment key={t.id} turn={t} />))}</>
  );
}

export interface TimelineSegmentState extends Record<string, unknown> {
  role: Role;
  active: boolean;
  past: boolean;
  interrupted: boolean;
  /** Picked in the player's selection. */
  selected: boolean;
}

export interface TimelineSegmentProps extends PartProps<"div", TimelineSegmentState> {
  turn: Turn;
}

/** One turn as a span of the lane: placed by `--segment-start` / `--segment-end` (0..1), with
 * `--segment-spoken` where an interrupted turn was cut off, so the unspoken rest can be drawn
 * apart. Renders a `<div>`. */
export function TimelineSegment(props: TimelineSegmentProps): React.ReactElement {
  const { turn, ...rest } = props;
  const { conversation, clock, duration } = useTimeline("Timeline.Segment");
  const { selection } = usePlayer("Timeline.Segment");
  const selected = useSelected(selection, "turnId", turn.id);
  const where = useClockValue(
    clock,
    (c) => {
      const t = c.time();
      if (turnAt(conversation, t)?.id === turn.id) return "active";
      return t > spokenUntil(turn) ? "past" : "upcoming";
    },
    "upcoming",
  );
  const start = frac(turn.start, duration);
  const end = frac(Math.max(turn.end, turn.start + 0.05), duration);
  return usePart(
    "timeline-segment",
    "div",
    {
      role: turn.role,
      active: where === "active",
      past: where === "past",
      interrupted: turn.interruptedAt !== undefined,
      selected,
    },
    rest as PartProps<"div", TimelineSegmentState>,
    {
      "aria-hidden": true,
      style: {
        ...placeStyle(turn.start, Math.max(turn.end, turn.start + 0.05), duration),
        "--segment-start": start,
        "--segment-end": end,
        "--segment-spoken":
          turn.interruptedAt !== undefined ? (frac(turn.interruptedAt, duration) - start) / (end - start) : 1,
        position: "absolute",
        top: 0,
        bottom: 0,
      } as React.CSSProperties,
    },
  );
}

export interface TimelineMarkersProps {
  /** Which events; all by default. */
  filter?: (event: ConversationEvent) => boolean;
  /** Adds the caller's waits (end of their speech to the agent's reply) where the conversation
   * has no latency events of its own. */
  measureLatency?: boolean;
  /** Seconds a wait may take: longer latency markers get `data-slow`. */
  budget?: number;
  children?: (event: ConversationEvent) => React.ReactNode;
}

/** A `Timeline.Marker` for each event. */
export function TimelineMarkers(props: TimelineMarkersProps): React.ReactElement {
  const { conversation } = useTimeline("Timeline.Markers");
  const events = useMemo(() => {
    const all = props.measureLatency
      ? [...conversation.events, ...measureLatency(conversation)]
      : conversation.events;
    return props.filter ? all.filter(props.filter) : all;
  }, [conversation, props.measureLatency, props.filter]);
  return (
    <>
      {events.map((e) =>
        props.children ? props.children(e) : <TimelineMarker key={e.id} event={e} budget={props.budget} />,
      )}
    </>
  );
}

export interface TimelineMarkerState extends Record<string, unknown> {
  type: ConversationEvent["type"];
  status: string | undefined;
  pass: boolean | undefined;
  /** Has a duration (a tool call with its result, a latency). */
  span: boolean;
  /** The playhead is within it (or, for a point, has passed it). */
  reached: boolean;
  /** A latency over the budget. */
  slow: boolean;
}

export interface TimelineMarkerProps extends PartProps<"div", TimelineMarkerState> {
  event: ConversationEvent;
  /** Seconds a wait may take before a latency marker is `data-slow`. */
  budget?: number | undefined;
}

/** An event on the timeline: placed at `--marker-at` (0..1), and for one with a duration spanning
 * to `--marker-end`. Its `title` says what it is; screen readers get the events from the
 * transcript and the scrubber instead. Renders a `<div>`. */
export function TimelineMarker(props: TimelineMarkerProps): React.ReactElement {
  const { event, budget, ...rest } = props;
  const { clock, labels, duration } = useTimeline("Timeline.Marker");
  const end = "end" in event && event.end !== undefined ? event.end : event.at;
  const reached = useClockValue(clock, (c) => c.time() >= event.at, false);
  const at = frac(event.at, duration);
  const to = frac(end, duration);
  return usePart(
    "timeline-marker",
    "div",
    {
      type: event.type,
      status: event.type === "tool_call" ? (event.status ?? "ok") : undefined,
      pass: event.type === "verdict" ? event.pass : undefined,
      span: end > event.at,
      reached,
      slow: event.type === "latency" && budget !== undefined && end - event.at > budget,
    },
    rest as PartProps<"div", TimelineMarkerState>,
    {
      "aria-hidden": true,
      title: `${formatTime(event.at)} ${describeEvent(event, labels)}`,
      style: {
        ...placeStyle(event.at, end > event.at ? end : undefined, duration),
        "--marker-at": at,
        "--marker-end": to,
        position: "absolute",
      } as React.CSSProperties,
    },
  );
}

export interface TimelineWaveformState extends Record<string, unknown> {
  speaker: Role | "all";
  /** Drawn from word timings, as the call has no overview of its own. */
  synthetic: boolean;
}

export interface TimelineWaveformProps extends PartProps<"canvas", TimelineWaveformState> {
  /** Whose audio, when the call has an overview per role; the mixed one by default. */
  speaker?: Role;
  /** What to draw instead of the conversation's overview: an amplitude overview, or a min/max
   * pyramid (`buildPyramid`) that keeps its detail as you zoom in. */
  peaks?: Peaks | PeakPyramid;
  /** `bars` (rounded, mirrored; the default) or `minmax` (each pixel from its lowest to its
   * highest sample, as an audio editor draws it). */
  shape?: "bars" | "minmax";
  /** Bar width and the gap between bars, in CSS pixels; 2 and 1 by default. */
  bar?: number;
  gap?: number;
  /** The smallest bar, as a fraction of the height, so silence still reads as a line. */
  floor?: number;
}

/** The waveform of the part of the call in view, on a canvas as wide as the view. Bars take the
 * canvas's CSS `color`; the played part takes `--waveform-played` (the same colour at full
 * strength by default, the rest at 35%). A call without an overview gets one drawn from its word
 * timings. Renders a `<canvas>`. */
export function TimelineWaveform(props: TimelineWaveformProps): React.ReactElement {
  const { speaker: role, peaks: own, shape = "bars", bar = 2, gap = 1, floor = 0.06, ...rest } = props;
  const { conversation, clock, duration, viewport } = useTimeline("Timeline.Waveform");
  const given = own ?? peaksFor(conversation, role);
  const source = useMemo(
    () =>
      given ??
      peaksFromWords(
        conversation.turns.filter((t) => !role || t.role === role),
        duration,
      ),
    [given, conversation, role, duration],
  );
  const ref = useRef<HTMLCanvasElement>(null);

  useIsoLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = createWaveformRenderer({ source, shape, bar, gap, floor });
    return driveLane(canvas, renderer, { clock, view: viewport, duration, followTime: true });
  }, [clock, viewport, source, duration, shape, bar, gap, floor]);

  return usePart(
    "timeline-waveform",
    "canvas",
    { speaker: role ?? "all", synthetic: !given },
    rest as PartProps<"canvas", TimelineWaveformState>,
    { "aria-hidden": true, style: { display: "block", width: "100%" } },
    [ref as React.Ref<never>],
  );
}

export interface TimelineRulerState extends Record<string, unknown> {
  zoomed: boolean;
}

export interface TimelineRulerProps extends Omit<PartProps<"div", TimelineRulerState>, "children"> {
  /** Least pixels between two labels; 64 by default. */
  minGap?: number;
  /** A tick's label; `m:ss` by default (`m:ss.s` under a second apart). */
  children?: (time: number, step: number) => React.ReactNode;
}

/** Time labels along the view, at round steps that fit its width: 5 s apart at a glance, a tenth
 * of a second zoomed in. Each tick is a `<span data-slot="timeline-tick">` placed like a marker.
 * Re-renders only when the set of ticks changes. Renders a `<div>`. */
export function TimelineRuler(props: TimelineRulerProps): React.ReactElement {
  const { minGap = 64, children, ...rest } = props;
  const { duration, viewport } = useTimeline("Timeline.Ruler");
  const ref = useRef<HTMLElement>(null);
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
  // Until it's measured (and on the server), tick as if it were 1000 px wide.
  const snapshot = () => {
    const { step, times } = ticks(viewport.get(), width || 1000, minGap);
    return `${step}:${times.join(",")}`;
  };
  const key = useSyncExternalStore(viewport.subscribe, snapshot, snapshot);
  const [step, times] = useMemo(() => {
    const [s = "1", list = ""] = key.split(":");
    return [Number(s), list ? list.split(",").map(Number) : []] as const;
  }, [key]);
  const label = (t: number) => (step < 1 ? `${formatTime(t)}.${Math.round((t % 1) * 10)}` : formatTime(t));
  const zoomed = !isFullView(viewport.get(), duration);
  return usePart(
    "timeline-ruler",
    "div",
    { zoomed },
    rest as PartProps<"div", TimelineRulerState>,
    {
      "aria-hidden": true,
      style: { position: "relative" },
      children: times.map((t) => (
        <span
          key={t}
          data-slot="timeline-tick"
          style={{ ...placeStyle(t, undefined, duration), position: "absolute" }}
        >
          {children ? children(t, step) : label(t)}
        </span>
      )),
    },
    [ref as React.Ref<never>],
  );
}

export interface TimelineSkimmerState extends Record<string, unknown> {
  /** The pointer is over the scrubber. */
  visible: boolean;
}

export interface SkimInfo {
  /** Seconds under the pointer. */
  time: number;
  /** The turn being spoken there, if any. */
  turn: Turn | undefined;
  /** Events within a quarter second of it. */
  events: ConversationEvent[];
}

export interface TimelineSkimmerProps extends Omit<PartProps<"div", TimelineSkimmerState>, "children"> {
  /** What it shows; the time as `m:ss` by default. */
  children?: (info: SkimInfo) => React.ReactNode;
}

/** A hairline that follows the pointer over the scrubber, apart from the playhead: it shows what
 * was said there without moving playback. Placed by `--skim` (0..1); `data-visible` while
 * hovering; hidden from screen readers (the scrubber names its own position). Renders a `<div>`. */
export function TimelineSkimmer(props: TimelineSkimmerProps): React.ReactElement {
  const { children, ...rest } = props;
  const { conversation, duration, skim } = useTimeline("Timeline.Skimmer");
  const time = useSyncExternalStore(skim.subscribe, skim.get, () => null);
  const visible = time !== null;
  const info: SkimInfo | null = visible
    ? { time, turn: turnAt(conversation, time), events: eventsIn(conversation, time - 0.25, time + 0.25) }
    : null;
  return usePart("timeline-skimmer", "div", { visible }, rest as PartProps<"div", TimelineSkimmerState>, {
    "aria-hidden": true,
    hidden: !visible,
    children: info ? (children ? children(info) : formatTime(info.time)) : null,
    style: {
      "--skim": visible ? frac(time, duration) : 0,
      position: "absolute",
      top: 0,
      bottom: 0,
      left: placeVar("--skim"),
      pointerEvents: "none",
    } as React.CSSProperties,
  });
}

export interface TimelineOverlapsProps {
  children?: (overlap: { start: number; end: number; talking: Turn; barging: Turn }) => React.ReactNode;
}

/** A `Timeline.Overlap` wherever the caller and the agent talked at once. */
export function TimelineOverlaps(props: TimelineOverlapsProps): React.ReactElement {
  const { conversation } = useTimeline("Timeline.Overlaps");
  const spans = useMemo(() => overlaps(conversation), [conversation]);
  return (
    <>
      {spans.map((o) =>
        props.children ? (
          props.children(o)
        ) : (
          <TimelineOverlap key={`${o.talking.id}-${o.barging.id}`} {...o} />
        ),
      )}
    </>
  );
}

export interface TimelineOverlapState extends Record<string, unknown> {
  /** Who cut in. */
  barging: Role;
}

export interface TimelineOverlapProps extends PartProps<"div", TimelineOverlapState> {
  start: number;
  end: number;
  talking: Turn;
  barging: Turn;
}

/** Talk-over: a span from where one side cut in to where the other stopped, placed like a
 * segment (`--overlap-start`, `--overlap-end`); hatch it across the lanes. Renders a `<div>`. */
export function TimelineOverlap(props: TimelineOverlapProps): React.ReactElement {
  const { start, end, talking: _talking, barging, ...rest } = props;
  const { duration } = useTimeline("Timeline.Overlap");
  const a = frac(start, duration);
  const b = frac(end, duration);
  return usePart(
    "timeline-overlap",
    "div",
    { barging: barging.role },
    rest as PartProps<"div", TimelineOverlapState>,
    {
      "aria-hidden": true,
      style: {
        ...placeStyle(start, end, duration),
        "--overlap-start": a,
        "--overlap-end": b,
        position: "absolute",
        top: 0,
        bottom: 0,
        minWidth: 2,
      } as React.CSSProperties,
    },
  );
}
