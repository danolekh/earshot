/* A clock backed by a media element: its time is the element's, read every frame while it plays,
 * so the parts following it move smoothly instead of at `timeupdate`'s four-times-a-second. */

import type { Clock } from "../core/clock";

export function createMediaClock(
  element: HTMLMediaElement,
  fallbackDuration: () => number,
): Clock & { dispose(): void } {
  const listeners = new Set<() => void>();
  let raf = 0;
  const emit = () => listeners.forEach((l) => l());
  const loop = () => {
    emit();
    raf = element.paused ? 0 : requestAnimationFrame(loop);
  };
  const start = () => {
    if (!raf) raf = requestAnimationFrame(loop);
    emit();
  };
  const events = ["seeked", "seeking", "ratechange", "durationchange", "pause", "ended", "loadedmetadata"];
  events.forEach((e) => element.addEventListener(e, emit));
  element.addEventListener("play", start);
  element.addEventListener("playing", start);

  return {
    time: () => element.currentTime,
    playing: () => !element.paused && !element.ended,
    duration: () => {
      const d = element.duration;
      return Number.isFinite(d) && d > 0 ? d : fallbackDuration();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    seek(t) {
      element.currentTime = Math.max(0, t);
      emit();
    },
    play() {
      void element.play().catch(() => {});
    },
    pause() {
      element.pause();
    },
    rate: () => element.playbackRate,
    setRate(rate) {
      element.playbackRate = rate;
    },
    dispose() {
      events.forEach((e) => element.removeEventListener(e, emit));
      element.removeEventListener("play", start);
      element.removeEventListener("playing", start);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
