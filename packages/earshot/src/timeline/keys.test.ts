import { describe, expect, it } from "vitest";

import { call, manualClock } from "../test/fixtures";
import { applyKeyAction, scrubberKey } from "./keys";
import { createViewport } from "./viewport";

const key = (
  k: string,
  mods: Partial<{ shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {},
) => ({
  key: k,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods,
});

describe("the scrubber's keys", () => {
  it("steps a word, 5 s with Shift, a turn with Alt", () => {
    expect(scrubberKey(call, 0.6, key("ArrowRight"))).toEqual({ type: "seek", to: 0.75 });
    expect(scrubberKey(call, 0.6, key("ArrowLeft"))).toEqual({ type: "seek", to: 0 });
    expect(scrubberKey(call, 0.6, key("ArrowRight", { shiftKey: true }))).toEqual({ type: "seek", to: 5.6 });
    expect(scrubberKey(call, 0.6, key("ArrowRight", { altKey: true }))).toEqual({ type: "seek", to: 3.2 });
  });

  it("hops markers, and failed judges with Shift", () => {
    expect(scrubberKey(call, 0, key("]"))).toEqual({ type: "seek", to: 4.4 });
    expect(scrubberKey(call, 0, key("]", { shiftKey: true }))).toEqual({ type: "seek", to: 7 });
    expect(scrubberKey(call, 7, key("["))).toEqual({ type: "seek", to: 4.4 });
    expect(scrubberKey(call, 7, key("]"))).toBeNull();
  });

  it("plays, shuttles and changes speed; leaves shortcuts with Cmd or Ctrl alone", () => {
    expect(scrubberKey(call, 3, key(" "))).toEqual({ type: "toggle" });
    expect(scrubberKey(call, 3, key("l"))).toEqual({ type: "seek", to: 13 });
    expect(scrubberKey(call, 3, key("j"))).toEqual({ type: "seek", to: -7 });
    expect(scrubberKey(call, 3, key("."))).toEqual({ type: "rate", by: 0.25 });
    expect(scrubberKey(call, 3, key("ArrowRight", { metaKey: true }))).toBeNull();
    expect(scrubberKey(call, 3, key("x"))).toBeNull();
  });
});

describe("scrubberKey with a view and marks", () => {
  const press = (k: string, shiftKey = false) => ({
    key: k,
    shiftKey,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  });

  it("zooms at the playhead, pans a quarter, fits", () => {
    const view = { from: 0, to: 8 };
    expect(scrubberKey(call, 2, press("w"), { view })).toEqual({ type: "zoom", factor: 0.5, anchor: 2 });
    expect(scrubberKey(call, 2, press("-"), { view })).toEqual({ type: "zoom", factor: 2, anchor: 2 });
    expect(scrubberKey(call, 2, press("d"), { view })).toEqual({ type: "pan", by: 2 });
    expect(scrubberKey(call, 2, press("0"), { view })).toEqual({ type: "fit" });
  });

  it("leaves those keys alone without a view", () => {
    expect(scrubberKey(call, 2, press("w"))).toBeNull();
  });

  it("hops between the marks it's given", () => {
    expect(scrubberKey(call, 2, press("]"), { marks: [1, 5, 9] })).toEqual({ type: "seek", to: 5 });
    expect(scrubberKey(call, 6, press("[", true), { marks: [1, 5], failures: [3] })).toEqual({
      type: "seek",
      to: 3,
    });
  });
});

describe("marks with ids", () => {
  const e = (k: string, shiftKey = false) => ({
    key: k,
    shiftKey,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  });
  const marks = [
    { at: 4.7, id: "a" },
    { at: 9.7, id: "b" },
  ];

  it("say which one a hop landed on", () => {
    expect(scrubberKey(call, 0, e("]"), { marks })).toEqual({ type: "seek", to: 4.7, mark: "a" });
    // From where the first hop landed, the next one.
    expect(scrubberKey(call, 4.7, e("]"), { marks })).toEqual({ type: "seek", to: 9.7, mark: "b" });
    expect(scrubberKey(call, 9.7, e("["), { marks })).toEqual({ type: "seek", to: 4.7, mark: "a" });
    expect(scrubberKey(call, 0, e("]"), { marks: [4.7] })).toEqual({ type: "seek", to: 4.7 });
  });
});

describe("doing a key action", () => {
  it("keeps a seek inside the call and pages the view to it, and the rate within bounds", () => {
    const clock = manualClock(20);
    const viewport = createViewport(20, { initial: { from: 0, to: 5 } });
    applyKeyAction({ type: "seek", to: 25 }, { clock, viewport, duration: 20 });
    expect(clock.time()).toBe(20);
    expect(viewport.get().to).toBe(20);
    for (let i = 0; i < 20; i++)
      applyKeyAction({ type: "rate", by: 0.25 }, { clock, viewport, duration: 20 });
    expect(clock.rate()).toBe(3);
    applyKeyAction({ type: "fit" }, { clock, viewport, duration: 20 });
    expect(viewport.get()).toEqual({ from: 0, to: 20 });
  });
});
