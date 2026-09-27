import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Player } from "../player";
import { Timeline } from "../timeline";
import { Transcript } from "../transcript";
import { FakeContext, matrix } from "./fake-audio";
import { call } from "./fixtures";

let context: FakeContext;
// \`new AudioContext()\` gives a fake, kept for the test to read.
vi.stubGlobal(
  "AudioContext",
  vi.fn(function audioContext() {
    context = new FakeContext();
    return context;
  }),
);

afterEach(cleanup);

function Call({ channels }: { channels?: readonly ("user" | "agent")[] }) {
  return (
    <Player.Root conversation={call} src="/call.ogg" {...(channels && { channels })}>
      <Player.Mute speaker="user" />
      <Player.Solo speaker="agent" />
      <Timeline.Root>
        <Timeline.Lane speaker="user" data-testid="user" />
        <Timeline.Lane speaker="agent" data-testid="agent" />
      </Timeline.Root>
    </Player.Root>
  );
}

describe("hearing one side", () => {
  it("mutes a side from its button, and the lane says so", () => {
    render(<Call channels={["user", "agent"]} />);
    const mute = screen.getByRole("button", { name: "Mute the caller" });
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("user").hasAttribute("data-muted")).toBe(false);
    act(() => mute.click());
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("user").hasAttribute("data-muted")).toBe(true);
    // Routed through Web Audio on that click: the caller silent, the agent (the one side left) in
    // both ears.
    expect(matrix(context)).toEqual([0, 0, 1, 1]);
  });

  it("solo wins over mute, and a soloed side is heard in both ears", () => {
    render(<Call channels={["user", "agent"]} />);
    act(() => screen.getByRole("button", { name: "Solo the agent" }).click());
    expect(screen.getByTestId("user").hasAttribute("data-muted")).toBe(true);
    expect(screen.getByTestId("agent").hasAttribute("data-muted")).toBe(false);
    expect(matrix(context)).toEqual([0, 0, 1, 1]);
  });

  it("can't mute a side the recording doesn't have on its own", () => {
    render(<Call />);
    expect((screen.getByRole("button", { name: "Mute the caller" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("picking a turn from the transcript", () => {
  it("is a button that picks it, current while it's the pick, named when empty", () => {
    render(
      <Player.Root conversation={call}>
        <Transcript.Root>
          <Transcript.Turns>
            {(turn) => (
              <Transcript.Turn key={turn.id} turn={turn}>
                <Transcript.Pick />
              </Transcript.Turn>
            )}
          </Transcript.Turns>
        </Transcript.Root>
      </Player.Root>,
    );
    const [first, second] = screen.getAllByRole("button");
    expect(first!.getAttribute("aria-label")).toMatch(/^Pick the (agent|caller)'s turn at 0:0\d$/);
    act(() => second!.click());
    expect(second!.getAttribute("aria-current")).toBe("true");
    expect(first!.hasAttribute("aria-current")).toBe(false);
  });
});
