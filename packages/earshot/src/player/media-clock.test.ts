import { describe, expect, it, vi } from "vitest";

import { createMediaClock } from "./media-clock";

function fakeElement() {
  const el = document.createElement("audio");
  let time = 0;
  let paused = true;
  Object.defineProperties(el, {
    currentTime: { get: () => time, set: (v: number) => void (time = v) },
    paused: { get: () => paused },
    duration: { get: () => NaN },
  });
  el.play = () => ((paused = false), el.dispatchEvent(new Event("play")), Promise.resolve());
  el.pause = () => ((paused = true), void el.dispatchEvent(new Event("pause")));
  return el;
}

describe("createMediaClock", () => {
  it("reads the element's time, falls back to the call's length, and tells its listeners", () => {
    const el = fakeElement();
    const clock = createMediaClock(el, () => 42);
    const listener = vi.fn<() => void>();
    clock.subscribe(listener);
    expect(clock.duration()).toBe(42);
    clock.seek(3);
    expect(clock.time()).toBe(3);
    expect(listener).toHaveBeenCalled();
    clock.play();
    expect(clock.playing()).toBe(true);
    clock.pause();
    expect(clock.playing()).toBe(false);
    clock.dispose();
  });
});
