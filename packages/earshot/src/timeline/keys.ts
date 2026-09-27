/* The scrubber's keyboard, as a pure function from a key to what it does, so the map can be read
 * and tested in one place. Media-player conventions where they exist (Space and K, J and L,
 * Home/End, `,` and `.` for speed), call-review ones where they don't: a word, a turn, a marker,
 * the next failed judge. */

import type { Clock } from "../core/clock";
import { nextTurn, prevTurn, stepWord } from "../core/conversation";
import type { Conversation, ConversationEvent } from "../core/types";
import type { View, Viewport } from "./viewport";

/** A place `[` `]` hop to that says what's there (a finding's id), so a hop can also pick it. */
export interface Mark {
  at: number;
  id: string;
}

export type KeyAction =
  /** `mark`: the id of the mark it hopped to. */
  | { type: "seek"; to: number; mark?: string }
  | { type: "toggle" }
  | { type: "rate"; by: number }
  /** `factor` < 1 zooms in, around `anchor` (seconds). */
  | { type: "zoom"; factor: number; anchor: number }
  | { type: "pan"; by: number }
  | { type: "fit" }
  | null;

export interface KeyOptions {
  /** What `[` `]` hop between (times, or marks with ids); every event by default. */
  marks?: readonly (number | Mark)[];
  /** What Shift+`[` `]` hop between; failed judges by default. */
  failures?: readonly (number | Mark)[];
  /** The part of the call shown; zoom and pan keys only work with it. */
  view?: View;
}

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

type Hop = { at: number; id?: string };

const eventTimes = (c: Conversation, match: (e: ConversationEvent) => boolean): Hop[] =>
  c.events.filter(match).map((e) => ({ at: e.at }));
const hops = (marks: readonly (number | Mark)[]): Hop[] =>
  marks.map((m) => (typeof m === "number" ? { at: m } : m));

const after = (marks: readonly Hop[], t: number) =>
  marks.filter((x) => x.at > t + 0.05).sort((a, b) => a.at - b.at)[0];
const before = (marks: readonly Hop[], t: number) =>
  marks.filter((x) => x.at < t - 0.25).sort((a, b) => b.at - a.at)[0];

/** What a key does at `t`. Arrow keys move a word (Shift: 5 s; Alt: a turn), Page Up/Down a turn,
 * `[` `]` the previous or next marker (Shift: failed judge), J and L 10 s, Home and End the ends,
 * Space and K play or pause, `,` and `.` slow down or speed up. Given a view: W and S (or + and -)
 * zoom in and out at `t`, A and D pan a quarter of the view, 0 fits the whole call. */
export function scrubberKey(c: Conversation, t: number, e: KeyInput, options: KeyOptions = {}): KeyAction {
  if (e.metaKey || e.ctrlKey) return null;
  const marks = (failed: boolean) =>
    failed
      ? options.failures
        ? hops(options.failures)
        : eventTimes(c, (x) => x.type === "verdict" && !x.pass)
      : options.marks
        ? hops(options.marks)
        : eventTimes(c, () => true);
  const view = options.view;
  if (view) {
    const span = view.to - view.from;
    const anchor = t >= view.from && t <= view.to ? t : (view.from + view.to) / 2;
    switch (e.key) {
      case "w":
      case "W":
      case "+":
      case "=":
        return { type: "zoom", factor: 0.5, anchor };
      case "s":
      case "S":
      case "-":
      case "_":
        return { type: "zoom", factor: 2, anchor };
      case "a":
      case "A":
        return { type: "pan", by: -span / 4 };
      case "d":
      case "D":
        return { type: "pan", by: span / 4 };
      case "0":
        return { type: "fit" };
    }
  }
  const seek = (to: number | undefined) => (to === undefined ? null : ({ type: "seek", to } as const));
  const hop = (m: Hop | undefined): KeyAction =>
    m === undefined ? null : { type: "seek", to: m.at, ...(m.id !== undefined && { mark: m.id }) };
  const forward = e.key === "ArrowRight" || e.key === "ArrowUp";
  const back = e.key === "ArrowLeft" || e.key === "ArrowDown";
  if (forward || back) {
    if (e.shiftKey) return seek(t + (forward ? 5 : -5));
    if (e.altKey) return seek(forward ? (nextTurn(c, t)?.start ?? c.duration) : (prevTurn(c, t)?.start ?? 0));
    return seek(stepWord(c, t, forward ? 1 : -1) ?? (forward ? c.duration : 0));
  }
  switch (e.key) {
    case "PageUp":
      return seek(nextTurn(c, t)?.start ?? c.duration);
    case "PageDown":
      return seek(prevTurn(c, t)?.start ?? 0);
    case "]":
    case "}":
      return hop(after(marks(e.shiftKey), t));
    case "[":
    case "{":
      return hop(before(marks(e.shiftKey), t));
    case "j":
    case "J":
      return seek(t - 10);
    case "l":
    case "L":
      return seek(t + 10);
    case "Home":
      return seek(0);
    case "End":
      return seek(c.duration);
    case " ":
    case "k":
    case "K":
      return { type: "toggle" };
    case ",":
    case "<":
      return { type: "rate", by: -0.25 };
    case ".":
    case ">":
      return { type: "rate", by: 0.25 };
    default:
      return null;
  }
}

/** What a key action is done on. */
export interface KeyTargets {
  clock: Clock;
  viewport: Viewport;
  duration: number;
}

/** Does what a key action says, as `Timeline.Scrubber` does by default: a seek stays inside the
 * call and pages the view to it, the rate stays within 0.5–3×. For handling keys yourself
 * (`onKeyAction`) and doing the usual thing for the ones you don't. */
export function applyKeyAction(action: Exclude<KeyAction, null>, t: KeyTargets): void {
  switch (action.type) {
    case "seek": {
      const to = Math.min(t.duration, Math.max(0, action.to));
      t.clock.seek(to);
      t.viewport.reveal(to);
      return;
    }
    case "toggle":
      if (t.clock.playing()) t.clock.pause();
      else t.clock.play();
      return;
    case "rate":
      t.clock.setRate(Math.min(3, Math.max(0.5, t.clock.rate() + action.by)));
      return;
    case "zoom":
      t.viewport.zoom(action.factor, action.anchor);
      return;
    case "pan":
      t.viewport.pan(action.by);
      return;
    case "fit":
      t.viewport.fit();
  }
}
