import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { manualSource } from "../audio/source";
import { createLiveConversation } from "../core/live";
import { Orb } from "../orb";
import { Player } from "../player";
import { Timeline } from "../timeline";
import { Transcript } from "../transcript";
import { Visualizer } from "../visualizer";
import { call, manualClock } from "./fixtures";

afterEach(cleanup);

describe("the orb", () => {
  it("says its state in words and hides its canvas; without WebGL it reports failed", async () => {
    const { container } = render(
      <Orb.Root state="listening" input={manualSource()}>
        <Orb.Shader />
      </Orb.Root>,
    );
    const root = container.querySelector("[data-slot=orb]")!;
    expect(root.getAttribute("data-state")).toBe("listening");
    expect(container.querySelector("[aria-live]")!.textContent).toBe("Listening");
    const canvas = container.querySelector("canvas")!;
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(canvas.hasAttribute("data-failed")).toBe(true);
  });

  it("renders on the server", () => {
    const html = renderToString(
      <Orb.Root state="speaking">
        <Orb.Shader />
      </Orb.Root>,
    );
    expect(html).toContain('data-state="speaking"');
    expect(html).toContain("Speaking");
  });
});

describe("the visualizer", () => {
  it("renders its bars, hidden from screen readers", () => {
    const { container } = render(<Visualizer.Root source={manualSource()} bars={7} />);
    expect(container.querySelectorAll("[data-slot=visualizer-bar]")).toHaveLength(7);
    expect(container.querySelector("[data-slot=visualizer]")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("a live transcript", () => {
  it("is a log, busy while a turn streams", () => {
    const live = createLiveConversation();
    const { container } = render(
      <Transcript.Root conversation={live} live>
        <Transcript.Turns />
      </Transcript.Root>,
    );
    const root = container.querySelector("[data-slot=transcript]")!;
    expect(root.getAttribute("role")).toBe("log");
    expect(container.querySelector("[aria-live]")).toBeNull();
    let id = "";
    act(() => void (id = live.begin("user", 0)));
    expect(root.getAttribute("aria-busy")).toBe("true");
    act(() => live.finalize(id, 1));
    expect(root.getAttribute("aria-busy")).toBe("false");
  });
});

describe("latency budgets", () => {
  it("marks waits over the budget as slow, on the timeline and in the transcript", () => {
    const { container } = render(
      <Player.Root conversation={call} clock={manualClock()}>
        <Timeline.Root>
          <Timeline.Scrubber>
            <Timeline.Markers measureLatency budget={0.5} />
          </Timeline.Scrubber>
        </Timeline.Root>
        <Transcript.Root>
          <Transcript.Turns gaps={0.5} budget={0.5} />
        </Transcript.Root>
      </Player.Root>,
    );
    const latency = container.querySelector("[data-slot=timeline-marker][data-type=latency]")!;
    expect(latency.hasAttribute("data-slow")).toBe(true);
    const wait = container.querySelector("[data-slot=transcript-gap][data-kind=wait]")!;
    expect(wait.hasAttribute("data-slow")).toBe(true);
    expect(
      container.querySelector("[data-slot=transcript-gap][data-kind=silence]")!.hasAttribute("data-slow"),
    ).toBe(false);
  });
});

describe("transcript motion hooks", () => {
  it("marks words that arrive live as new, staggered within their batch, and shows the interim tail", () => {
    const live = createLiveConversation();
    let id = "";
    act(() => void (id = live.begin("user", 0)));
    const { container } = render(
      <Transcript.Root conversation={live} live>
        <Transcript.Turns />
      </Transcript.Root>,
    );
    act(() => live.appendText(id, "hello there"));
    act(() => live.appendText(id, "general kenobi"));
    act(() => live.setInterim(id, "you are a"));
    const words = [...container.querySelectorAll("[data-slot=transcript-word]")];
    expect(words.map((w) => w.hasAttribute("data-new"))).toEqual([true, true, true, true]);
    expect(words.map((w) => (w as HTMLElement).style.getPropertyValue("--word-stagger"))).toEqual([
      "0",
      "1",
      "0",
      "1",
    ]);
    expect(container.querySelector("[data-slot=transcript-interim]")!.textContent).toBe("you are a");
    act(() => live.finalize(id, 3));
    expect(container.querySelector("[data-slot=transcript-interim]")).toBeNull();
  });

  it("doesn't mark a review transcript's words as new, and sets each turn's distance from the one playing", () => {
    const clock = manualClock();
    const { container } = render(
      <Player.Root conversation={call} clock={clock}>
        <Transcript.Root>
          <Transcript.Turns />
        </Transcript.Root>
      </Player.Root>,
    );
    expect(container.querySelector("[data-slot=transcript-word][data-new]")).toBeNull();
    act(() => clock.seek(3.3));
    const turns = [...container.querySelectorAll("[data-slot=transcript-turn]")] as HTMLElement[];
    expect(turns.map((t) => t.style.getPropertyValue("--distance"))).toEqual(["1", "0", "1", "2"]);
  });
});
