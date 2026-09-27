import { describe, expect, it } from "vitest";

import { createVirtualClock } from "./clock";

function env() {
  let frames: ((now: number) => void)[] = [];
  let now = 0;
  return {
    env: {
      now: () => now,
      requestFrame: (cb: (n: number) => void) => frames.push(cb),
      cancelFrame: () => (frames = []),
    },
    run(ms: number, count: number) {
      for (let i = 0; i < count; i++) {
        now += ms;
        const due = frames;
        frames = [];
        due.forEach((f) => f(now));
      }
    },
  };
}

describe("createVirtualClock", () => {
  it("runs in real time at its rate, and stops at the end", () => {
    const e = env();
    const clock = createVirtualClock(1, { env: e.env });
    clock.setRate(2);
    clock.play();
    e.run(100, 3);
    expect(clock.time()).toBeCloseTo(0.4);
    e.run(100, 10);
    expect(clock.time()).toBe(1);
    expect(clock.playing()).toBe(false);
  });

  it("loops when asked, and seeks within its length", () => {
    const e = env();
    const clock = createVirtualClock(1, { env: e.env, loop: true });
    clock.play();
    e.run(300, 5);
    expect(clock.playing()).toBe(true);
    expect(clock.time()).toBeLessThan(1);
    clock.seek(5);
    expect(clock.time()).toBe(1);
  });
});
