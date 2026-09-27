/* A moment put on a call's player and taken off it: what a link opens at, and what a link to where
 * you are says. Framework-free: an app ties it to its URL (or a store) however it likes. */
import type { Clock } from "../core/clock";
import type { SelectionStore } from "../player/selection";
import { isFullView, type Viewport } from "../timeline/viewport";
import type { Moment } from "./moment";

/** What a moment is put on. Without a viewport, the view isn't set (a timeline that follows the
 * playhead still pages to it). */
export interface MomentTargets {
  clock: Clock;
  selection: SelectionStore;
  viewport?: Viewport;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Puts a moment on the player: the view, then what's picked (a finding brings its turn, when
 * `findings` says which), then the time. */
export function applyMoment(
  t: MomentTargets,
  m: Moment,
  options: { findings?: readonly { id: string; turnId?: string }[] } = {},
): void {
  if (t.viewport && m.from !== undefined && m.to !== undefined) t.viewport.set({ from: m.from, to: m.to });
  const finding = m.finding ? options.findings?.find((f) => f.id === m.finding) : undefined;
  const turn = m.turn ?? finding?.turnId;
  if (turn || m.span || m.finding)
    t.selection.set({
      ...(turn && { turnId: turn }),
      ...(m.span && { spanId: m.span }),
      ...(m.finding && { findingId: m.finding }),
    });
  if (m.t !== undefined) {
    t.clock.seek(m.t);
    t.viewport?.reveal(m.t);
  }
}

/** Where the player is, as a moment: the time (when past the start), the view (when zoomed), and
 * what's picked. */
export function currentMoment(t: MomentTargets): Moment {
  const time = round2(t.clock.time());
  const view = t.viewport?.get();
  const picked = t.selection.get();
  return {
    ...(time > 0 && { t: time }),
    ...(view &&
      t.viewport &&
      !isFullView(view, t.viewport.duration()) && { from: round2(view.from), to: round2(view.to) }),
    ...(picked.turnId && { turn: picked.turnId }),
    ...(picked.spanId && { span: picked.spanId }),
    ...(picked.findingId && { finding: picked.findingId }),
  };
}

/** Calls `onChange` with the current moment once things settle: after the view or what's picked
 * changes, and after a seek (while paused, or a jump of over a second while playing), debounced.
 * `schedule()` asks for one more (the app changed something of its own that goes in the link). */
export function watchMoment(
  t: MomentTargets,
  onChange: (moment: Moment) => void,
  options: { debounceMs?: number } = {},
): { schedule(): void; dispose(): void } {
  const wait = options.debounceMs ?? 250;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(currentMoment(t)), wait);
  };
  let last = t.clock.time();
  const off = [
    t.selection.subscribe(schedule),
    t.viewport?.subscribe(schedule),
    t.clock.subscribe(() => {
      const now = t.clock.time();
      if (!t.clock.playing() || Math.abs(now - last) > 1) schedule();
      last = now;
    }),
  ];
  return {
    schedule,
    dispose() {
      clearTimeout(timer);
      for (const o of off) o?.();
    },
  };
}
