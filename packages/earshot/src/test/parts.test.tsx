import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveConversation } from "../core/live";
import { Player } from "../player";
import { Timeline } from "../timeline";
import { Transcript } from "../transcript";
import { call, manualClock } from "./fixtures";

function Review({ clock }: { clock: ReturnType<typeof manualClock> }) {
  return (
    <Player.Root conversation={call} clock={clock}>
      <Player.Toggle />
      <Player.Time data-testid="time" />
      <Timeline.Root>
        <Timeline.Scrubber>
          <Timeline.Lane speaker="agent">
            <Timeline.Segments />
          </Timeline.Lane>
          <Timeline.Markers measureLatency />
          <Timeline.Playhead />
        </Timeline.Scrubber>
      </Timeline.Root>
      <Transcript.Root>
        <Transcript.Turns>
          {(turn) => (
            <Transcript.Turn key={turn.id} turn={turn} data-testid={turn.id}>
              <Transcript.Seek />
              <Transcript.Speaker />
              <Transcript.Words />
              <Transcript.Events />
            </Transcript.Turn>
          )}
        </Transcript.Turns>
      </Transcript.Root>
    </Player.Root>
  );
}

afterEach(cleanup);

const status = (text: string) => screen.getByText(text).getAttribute("data-status");

describe("a call under review", () => {
  it("marks the word and turn being played, and what's past", () => {
    const clock = manualClock();
    render(<Review clock={clock} />);
    act(() => clock.seek(0.6));
    expect(status("how")).toBe("active");
    expect(status("Hello,")).toBe("spoken");
    expect(status("help?")).toBe("upcoming");
    expect(screen.getByTestId("t0").hasAttribute("data-active")).toBe(true);
    act(() => clock.seek(3.3));
    expect(screen.getByTestId("t0").hasAttribute("data-past")).toBe(true);
    expect(screen.getByTestId("time").textContent).toBe("0:03");
  });

  it("keeps the words after a barge-in as unspoken", () => {
    render(<Review clock={manualClock()} />);
    expect(status("that")).toBe("unspoken");
    expect(status("check")).not.toBe("unspoken");
    expect(screen.getByTestId("t2").hasAttribute("data-interrupted")).toBe(true);
  });

  it("seeks by word click and by a turn's play button", () => {
    const clock = manualClock();
    render(<Review clock={clock} />);
    fireEvent.click(screen.getByText("my"));
    expect(clock.time()).toBe(3.55);
    fireEvent.click(screen.getByRole("button", { name: "Play from 0:05, Agent" }));
    expect(clock.time()).toBe(5);
    expect(clock.playing()).toBe(true);
  });

  it("drives the scrubber from the keyboard, and names where it is", () => {
    const clock = manualClock();
    render(<Review clock={clock} />);
    const slider = screen.getByRole("slider", { name: "Position in the call" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(clock.time()).toBe(0.5);
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(clock.time()).toBe(5.5);
    // Within a second of a turn's start, "previous" goes to the turn before, as a player's does.
    fireEvent.keyDown(slider, { key: "ArrowLeft", altKey: true });
    expect(clock.time()).toBe(3.2);
    fireEvent.keyDown(slider, { key: "PageDown" });
    expect(clock.time()).toBe(0);
    fireEvent.keyDown(slider, { key: "]" });
    expect(clock.time()).toBe(4.4);
    fireEvent.keyDown(slider, { key: "]", shiftKey: true });
    expect(clock.time()).toBe(7);
    fireEvent.keyDown(slider, { key: "." });
    expect(clock.rate()).toBe(1.25);
    fireEvent.keyDown(slider, { key: "End" });
    expect(clock.time()).toBe(call.duration);
    act(() => clock.seek(5.5));
    expect(slider.getAttribute("aria-valuetext")).toBe("0:05 of 0:07, Agent: Let me check that now.");
  });

  it("shows events inside their turn and on the timeline, with measured latency", () => {
    const { container } = render(<Review clock={manualClock()} />);
    expect(screen.getByTestId("t2").textContent).toContain("Tool call: lookup_order");
    const markers = container.querySelectorAll("[data-slot=timeline-marker]");
    expect([...markers].map((m) => m.getAttribute("data-type"))).toEqual(["tool_call", "verdict", "latency"]);
    expect(markers[1]!.hasAttribute("data-pass")).toBe(false);
    expect(markers[2]!.getAttribute("title")).toBe("0:04 Response time: 800 ms");
  });

  it("plays and pauses from the toggle", () => {
    const clock = manualClock();
    render(<Review clock={clock} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(clock.playing()).toBe(true);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});

describe("a live call", () => {
  it("announces each finished turn once, never word by word", () => {
    const live = createLiveConversation();
    const { container } = render(
      <Transcript.Root conversation={live} live announce>
        <Transcript.Turns />
      </Transcript.Root>,
    );
    const region = container.querySelector("[aria-live]")!;
    let id = "";
    act(() => {
      id = live.begin("agent", 0);
      live.appendText(id, "Hello, this is");
    });
    expect(region.textContent).toBe("");
    expect(container.textContent).toContain("Hello, this is");
    act(() => live.appendText(id, "the assistant."));
    act(() => live.finalize(id, 2));
    expect(region.textContent).toBe("Agent: Hello, this is the assistant.");
  });
});

describe("gaps, follow and the skimmer", () => {
  it("marks silences between turns, the caller's wait apart", () => {
    const { container } = render(
      <Player.Root conversation={call} clock={manualClock()}>
        <Transcript.Root>
          <Transcript.Turns gaps={0.5} />
        </Transcript.Root>
      </Player.Root>,
    );
    const gaps = [...container.querySelectorAll("[data-slot=transcript-gap]")];
    expect(gaps.map((g) => [g.getAttribute("data-kind"), g.textContent])).toEqual([
      ["silence", "1.7 s"],
      ["wait", "0.8 s"],
    ]);
  });

  it("stops following when the reader scrolls, until Resume", () => {
    const { container } = render(
      <Player.Root conversation={call} clock={manualClock()}>
        <Transcript.Root data-testid="root">
          <Transcript.Resume>Jump to now</Transcript.Resume>
          <Transcript.Turns />
        </Transcript.Root>
      </Player.Root>,
    );
    const root = screen.getByTestId("root");
    const resume = container.querySelector("[data-slot=transcript-resume]") as HTMLButtonElement;
    expect(root.hasAttribute("data-following")).toBe(true);
    expect(resume.hidden).toBe(true);
    act(() => void root.dispatchEvent(new Event("wheel")));
    expect(root.hasAttribute("data-following")).toBe(false);
    expect(resume.hidden).toBe(false);
    fireEvent.click(resume);
    expect(root.hasAttribute("data-following")).toBe(true);
  });

  it("shows what was said under the pointer without seeking", () => {
    const clock = manualClock();
    const { container } = render(
      <Player.Root conversation={call} clock={clock}>
        <Timeline.Root>
          <Timeline.Scrubber data-testid="scrub">
            <Timeline.Skimmer>{(s) => `${s.time.toFixed(1)} ${s.turn?.text ?? ""}`}</Timeline.Skimmer>
            <Timeline.Overlaps />
          </Timeline.Scrubber>
        </Timeline.Root>
      </Player.Root>,
    );
    const scrub = screen.getByTestId("scrub");
    scrub.getBoundingClientRect = () => ({
      left: 0,
      width: 700,
      top: 0,
      height: 40,
      right: 700,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.pointerMove(scrub, { clientX: 35, pointerType: "mouse" });
    const skimmer = container.querySelector("[data-slot=timeline-skimmer]")!;
    expect(skimmer.textContent).toBe("0.4 Hello, how can I help?");
    expect(clock.time()).toBe(0);
    fireEvent.pointerLeave(scrub);
    expect(skimmer.hasAttribute("data-visible")).toBe(false);
    expect(container.querySelectorAll("[data-slot=timeline-overlap]")).toHaveLength(1);
  });
});
