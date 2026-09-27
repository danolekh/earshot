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
