import { describe, expect, it } from "vitest";

import { createViewport, isFullView, ticks, zoomView } from "./viewport";

describe("viewport", () => {
  it("keeps the anchor where it is on screen when zooming", () => {
    const v = zoomView({ from: 0, to: 60 }, 0.5, 15, 60, 0.5);
    expect(v).toEqual({ from: 7.5, to: 37.5 });
    // 15 s was a quarter of the way across, and still is.
    expect((15 - v.from) / (v.to - v.from)).toBeCloseTo(0.25);
  });

  it("stays inside the call and no narrower than the minimum", () => {
    const v = zoomView({ from: 50, to: 60 }, 0.01, 59, 60, 0.5);
    expect(v.to - v.from).toBeCloseTo(0.5);
    expect((59 - v.from) / (v.to - v.from)).toBeCloseTo(0.9);
    expect(zoomView({ from: 0, to: 10 }, 100, 5, 60, 0.5)).toEqual({ from: 0, to: 60 });
    const vp = createViewport(60);
    vp.set({ from: 55, to: 70 });
    expect(vp.get()).toEqual({ from: 45, to: 60 });
  });

  it("pans, fits, pages to reveal a moment, and notifies only on change", () => {
    const vp = createViewport(60, { initial: { from: 10, to: 20 } });
    let calls = 0;
    vp.subscribe(() => calls++);
    vp.pan(5);
    expect(vp.get()).toEqual({ from: 15, to: 25 });
    vp.reveal(20);
    expect(calls).toBe(1);
    vp.reveal(40);
    expect(vp.get()).toEqual({ from: 39, to: 49 });
    vp.fit();
    expect(isFullView(vp.get(), 60)).toBe(true);
    expect(calls).toBe(3);
  });

  it("keeps showing the whole call when its length changes", () => {
    const vp = createViewport(10);
    vp.setDuration(60);
    expect(vp.get()).toEqual({ from: 0, to: 60 });
  });

  it("picks round tick steps that fit the width", () => {
    expect(ticks({ from: 0, to: 60 }, 800)).toMatchObject({ step: 5 });
    expect(ticks({ from: 12.3, to: 13.3 }, 800)).toMatchObject({
      step: 0.1,
      times: expect.arrayContaining([12.4, 13.3]),
    });
  });
});
