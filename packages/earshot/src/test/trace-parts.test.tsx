import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { fromLiveKit } from "../formats/livekit";
import { Player } from "../player";
import { createSelection } from "../player/selection";
import { Timeline } from "../timeline";
import { createViewport } from "../timeline/viewport";
import { runDetectors } from "../trace/detectors";
import { toConversation } from "../trace/trace";
import { Transcript } from "../transcript";
import { call, manualClock } from "./fixtures";
import { T0_MS, livekitTwoTurns } from "./trace-fixtures";

afterEach(cleanup);

const base = fromLiveKit({ otlp: livekitTwoTurns, recording: { startedAtUnixMs: T0_MS } });
const trace = { ...base, findings: runDetectors(base) };

function Debugger({ selection = createSelection() }: { selection?: ReturnType<typeof createSelection> }) {
  return (
    <Player.Root
      conversation={toConversation(trace)}
      clock={manualClock(trace.call.duration)}
      selection={selection}
    >
      <Timeline.Root>
        <Timeline.Scrubber>
          <Timeline.Lane data-testid="findings">
            <Timeline.Findings findings={trace.findings} />
          </Timeline.Lane>
          <Timeline.Lane speaker="user">
            <Timeline.Segments />
          </Timeline.Lane>
          <Timeline.Lane>
            <Timeline.Words words={trace.words.filter((w) => w.channel === "agent")} />
          </Timeline.Lane>
          <Timeline.Lane>
            <Timeline.Signals signals={trace.signals} />
          </Timeline.Lane>
          <Timeline.Lane>
            <Timeline.Spans spans={trace.spans} />
          </Timeline.Lane>
        </Timeline.Scrubber>
      </Timeline.Root>
      <Transcript.Root>
        <Transcript.Turns />
      </Transcript.Root>
    </Player.Root>
  );
}

describe("trace lanes", () => {
  it("draws spans, signals, words and findings from the trace", () => {
    const { container } = render(<Debugger />);
    const count = (slot: string) => container.querySelectorAll(`[data-slot=${slot}]`).length;
    expect(count("timeline-span")).toBe(6);
    expect(count("timeline-signal")).toBe(trace.signals.length);
    expect(
      container.querySelector("[data-slot=timeline-span][data-status=error]")?.getAttribute("title"),
    ).toContain("lookup_order");
    const unheard = container.querySelectorAll("[data-slot=timeline-word]:not([data-heard])");
    expect(unheard.length).toBeGreaterThan(0);
    expect(count("timeline-finding") + count("timeline-finding-cluster")).toBeGreaterThan(0);
  });

  it("picks a span on pointer down, and the transcript and lanes show its turn picked", () => {
    const selection = createSelection();
    const { container } = render(<Debugger selection={selection} />);
    const tool = container.querySelector("[data-slot=timeline-span][data-kind=tool]")!;
    act(() => void fireEvent.pointerDown(tool, { button: 0 }));
    expect(selection.get()).toEqual({ spanId: trace.spans.find((s) => s.kind === "tool")!.id, turnId: "t1" });
    expect(tool.hasAttribute("data-selected")).toBe(true);
    act(() => selection.set({ turnId: "t0" }));
    expect(container.querySelector("[data-slot=transcript-turn][data-selected]")).not.toBeNull();
    expect(container.querySelector("[data-slot=timeline-segment][data-selected]")).not.toBeNull();
  });
});

describe("render budget", () => {
  it("doesn't re-render while playing within a word, nor while panning a zoomed view", () => {
    const clock = manualClock();
    const viewport = createViewport(call.duration);
    let commits = 0;
    render(
      <Profiler id="review" onRender={() => void commits++}>
        <Player.Root conversation={call} clock={clock}>
          <Timeline.Root viewport={viewport}>
            <Timeline.Scrubber zoom>
              <Timeline.Lane speaker="agent">
                <Timeline.Segments />
              </Timeline.Lane>
              <Timeline.Markers measureLatency />
              <Timeline.Overlaps />
              <Timeline.Playhead />
            </Timeline.Scrubber>
          </Timeline.Root>
          <Transcript.Root>
            <Transcript.Turns />
          </Transcript.Root>
        </Player.Root>
      </Profiler>,
    );
    act(() => clock.seek(0.05));
    commits = 0;
    for (let i = 1; i <= 30; i++) act(() => clock.seek(0.05 + i * 0.01));
    expect(commits).toBe(0);

    act(() => viewport.zoom(0.25, 2));
    commits = 0;
    const root = document.querySelector("[data-slot=timeline]") as HTMLElement;
    const before = root.style.getPropertyValue("--view-from");
    for (let i = 0; i < 10; i++) act(() => viewport.pan(0.1));
    expect(commits).toBe(0);
    expect(root.style.getPropertyValue("--view-from")).not.toBe(before);
  });
});
