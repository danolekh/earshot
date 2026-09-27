import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Player } from "../player";
import { Timeline } from "../timeline";
import type { KeyAction } from "../timeline/keys";
import { createViewport } from "../timeline/viewport";
import { Transcript } from "../transcript";
import { call, manualClock } from "./fixtures";

afterEach(cleanup);

describe("handling the scrubber's keys yourself", () => {
  it("gets the action, with the mark a hop landed on, in place of the default", () => {
    const clock = manualClock();
    const seen: KeyAction[] = [];
    render(
      <Player.Root conversation={call} clock={clock}>
        <Timeline.Root>
          <Timeline.Scrubber marks={[{ at: 2, id: "f1" }]} onKeyAction={(a) => seen.push(a)} />
        </Timeline.Root>
      </Player.Root>,
    );
    const slider = screen.getByRole("slider");
    const event = fireEvent.keyDown(slider, { key: "]" });
    expect(event).toBe(false); // prevented
    expect(seen).toEqual([{ type: "seek", to: 2, mark: "f1" }]);
    expect(clock.time()).toBe(0);
  });
});

describe("the view after a seek", () => {
  it("pages to the playhead when it's out of view, unless told not to", () => {
    const clock = manualClock();
    const viewport = createViewport(call.duration, { initial: { from: 0, to: 2 } });
    const { rerender } = render(
      <Player.Root conversation={call} clock={clock}>
        <Timeline.Root viewport={viewport} />
      </Player.Root>,
    );
    clock.seek(call.duration - 1);
    expect(viewport.get().to).toBeGreaterThan(call.duration - 1);
    viewport.set({ from: 0, to: 2 });
    rerender(
      <Player.Root conversation={call} clock={clock}>
        <Timeline.Root viewport={viewport} reveal={false} />
      </Player.Root>,
    );
    clock.seek(call.duration - 2);
    expect(viewport.get()).toEqual({ from: 0, to: 2 });
  });
});

describe("a transcript following playback", () => {
  it("stops following for the reader's own keys, not for keys a handler took", () => {
    render(
      <Player.Root conversation={call} clock={manualClock()}>
        <Transcript.Root>
          <Transcript.Resume>Follow</Transcript.Resume>
          <Transcript.Turns />
        </Transcript.Root>
      </Player.Root>,
    );
    const root = document.querySelector<HTMLElement>("[data-slot=transcript]")!;
    const taken = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    taken.preventDefault();
    root.dispatchEvent(taken);
    expect(root.hasAttribute("data-following")).toBe(true);
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(root.hasAttribute("data-following")).toBe(false);
  });
});

describe("the scrubber's wheel", () => {
  function setup() {
    const viewport = createViewport(call.duration, { initial: { from: 0, to: 2 } });
    render(
      <Player.Root conversation={call} clock={manualClock()}>
        <Timeline.Root viewport={viewport}>
          <Timeline.Scrubber zoom />
        </Timeline.Root>
      </Player.Root>,
    );
    const slider = screen.getByRole("slider");
    // happy-dom lays nothing out; the wheel needs the scrubber's width.
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 100,
      right: 1000,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const wheel = ({ ctrlKey = false, clientX = 0, ...init }: WheelEventInit) => {
      const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      // happy-dom's WheelEvent drops the modifier keys and the pointer position.
      Object.defineProperties(e, { ctrlKey: { value: ctrlKey }, clientX: { value: clientX } });
      slider.dispatchEvent(e);
      return e;
    };
    return { viewport, wheel };
  }

  it("keeps a sideways swipe at the start of the call from reaching the browser", () => {
    const { viewport, wheel } = setup();
    // Past the start, and mostly downward: a trackpad swipe that begins at an angle.
    expect(wheel({ deltaX: -40, deltaY: -30 }).defaultPrevented).toBe(true);
    expect(wheel({ deltaX: -20, deltaY: -40 }).defaultPrevented).toBe(true);
    expect(viewport.get().from).toBe(0);
  });

  it("leaves a plain vertical scroll to the page, and zooms with Ctrl", () => {
    const { viewport, wheel } = setup();
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(false);
    expect(wheel({ deltaX: 5, deltaY: 40 }).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: -100, ctrlKey: true, clientX: 500 }).defaultPrevented).toBe(true);
    expect(viewport.get().to - viewport.get().from).toBeLessThan(2);
  });
});
