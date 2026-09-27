import { describe, expect, it } from "vitest";

import { readCall, type Source, type TurnDraft } from "../formats/read";
import { runDetectors } from "./detectors";
import { measuredSpeech } from "./speech";

const turn = (
  key: string,
  channel: "caller" | "agent",
  start: number,
  end: number,
  text: string,
): TurnDraft => ({
  key,
  channel,
  start,
  end,
  text,
});

/** A mono call: the agent's greeting, the caller cutting in while it still plays, a long silence,
 * then the agent again. */
const mono: Source = {
  name: "mono",
  read: () => ({
    clock: { channels: ["mixed"] },
    turns: [
      turn("a", "agent", 0, 3, "Guten Tag, hier ist Ihre Stadtwerke"),
      turn("b", "caller", 2.5, 4, "Ja hallo"),
      turn("c", "agent", 8, 9, "Sind Sie noch da?"),
    ],
    speech: {
      mixed: [
        { start: 0.1, end: 3.9 },
        { start: 8.05, end: 8.9 },
      ],
    },
  }),
};

describe("speech in a mono recording", () => {
  const trace = readCall(mono);

  it("goes to the side whose turn started last, never to both", () => {
    expect(measuredSpeech(trace, "agent")).toEqual([
      { start: 0.1, end: 2.5 },
      { start: 8.05, end: 8.9 },
    ]);
    expect(measuredSpeech(trace, "caller")).toEqual([{ start: 2.5, end: 3.9 }]);
  });

  it("can't show talk-over, but shows the silence", () => {
    const found = runDetectors(trace).map((f) => f.type);
    expect(found).not.toContain("talk_over");
    expect(found).not.toContain("agent_did_not_stop");
    expect(found).toContain("dead_air");
  });

  it("gives the rest of an overlap back to the side still talking", () => {
    const cut = {
      turns: [
        { channel: "caller" as const, start: 0, end: 3 },
        { channel: "agent" as const, start: 1, end: 1.5 },
      ],
      speech: { mixed: [{ start: 0, end: 3 }] },
    };
    expect(measuredSpeech(cut, "caller")).toEqual([
      { start: 0, end: 1 },
      { start: 1.5, end: 3 },
    ]);
    expect(measuredSpeech(cut, "agent")).toEqual([{ start: 1, end: 1.5 }]);
  });

  it("leaves a stereo recording's own channels alone", () => {
    expect(measuredSpeech({ turns: [], speech: { caller: [{ start: 1, end: 2 }] } }, "caller")).toEqual([
      { start: 1, end: 2 },
    ]);
    expect(measuredSpeech({ turns: [] }, "caller")).toBeUndefined();
  });
});
