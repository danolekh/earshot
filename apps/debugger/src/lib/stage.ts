/* Filming the debugger frame by frame (apps/promo): a clock that reads the page's time, which the
 * recorder fakes and steps one frame at a time, in place of the recording's. It logs every play,
 * seek and stop, so the recorder can lay the call's own recording under the video afterwards.
 *
 * Only in a stage build (`vite build --mode stage`, which reads .env.stage): STAGE is false in
 * every other build, and all of this is dropped from it. */
import { gainsFor, type ListeningStore } from "@danolekh/earshot/audio";
import type { Clock, Role } from "@danolekh/earshot/core";
import type { Viewport } from "@danolekh/earshot/timeline";

export const STAGE: boolean = import.meta.env.VITE_STAGE === "1";

export interface StageAudioEvent {
  /** The page's time (ms) when it happened. */
  at: number;
  callId: string;
  /** `mix`: who is heard changed (mute or solo); `gains` is each file channel's. */
  kind: "play" | "seek" | "stop" | "mix";
  /** Where in the call (seconds). */
  t: number;
  gains?: [number, number];
}

declare global {
  interface Window {
    /** Set by the recorder before the page's scripts run. */
    __stage?: { audio: StageAudioEvent[]; clock?: Clock; viewport?: Viewport };
  }
}

/** The recorder is filming this page. */
export const filming = (): boolean => STAGE && typeof window !== "undefined" && !!window.__stage;

/** A clock over one call that the recorder's frames drive: its time is worked out from the page's
 * time at each read (not summed per frame), so picture and sound can't drift apart. */
export function createStageClock(callId: string, duration: number): Clock {
  const listeners = new Set<() => void>();
  let base = 0;
  let since = 0;
  let playing = false;
  let raf = 0;
  const now = () => performance.now();
  const time = () => (playing ? Math.min(duration, base + (now() - since) / 1000) : base);
  const log = (kind: StageAudioEvent["kind"], t: number) =>
    window.__stage?.audio.push({ at: now(), callId, kind, t });
  const emit = () => listeners.forEach((l) => l());
  const tick = () => {
    raf = 0;
    if (!playing) return;
    if (time() >= duration) {
      base = duration;
      playing = false;
      log("stop", duration);
    } else raf = requestAnimationFrame(tick);
    emit();
  };

  const clock: Clock = {
    time,
    playing: () => playing,
    duration: () => duration,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    seek(t) {
      base = Math.min(duration, Math.max(0, t));
      since = now();
      if (playing) log("seek", base);
      emit();
    },
    play() {
      if (playing) return;
      if (base >= duration) base = 0;
      playing = true;
      since = now();
      log("play", base);
      raf = requestAnimationFrame(tick);
      emit();
    },
    pause() {
      if (!playing) return;
      base = time();
      playing = false;
      cancelAnimationFrame(raf);
      raf = 0;
      log("stop", base);
      emit();
    },
    rate: () => 1,
    setRate(rate) {
      // The recording is laid under the video at its own speed.
      if (rate !== 1) console.error("stage: the rate stays at 1 while filming");
    },
  };
  if (window.__stage) window.__stage.clock = clock;
  return clock;
}

/** Tells the recorder the page is ready to film: fonts loaded, hydrated, two frames drawn. */
export function markStageReady(): void {
  void document.fonts.ready.then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.documentElement.setAttribute("data-stage-ready", "")),
    ),
  );
}

/** Logs who is heard (mute and solo) whenever it changes, so the recorder mixes the recording the
 * way the page would have played it. */
export function watchStageMix(
  callId: string,
  clock: Clock,
  listening: ListeningStore,
  channels: readonly (Role | null)[],
): () => void {
  return listening.subscribe(() =>
    window.__stage?.audio.push({
      at: performance.now(),
      callId,
      kind: "mix",
      t: clock.time(),
      gains: gainsFor(listening.get(), channels),
    }),
  );
}
