import { describe, expect, it } from "vitest";

import {
  createConversation,
  eventsIn,
  formatTime,
  gaps,
  measureLatency,
  nextTurn,
  overlaps,
  prevTurn,
  stepWord,
  turnAt,
  wordAt,
} from "./conversation";

const w = (text: string, start: number, end: number) => ({ text, start, end });

const call = createConversation({
  turns: [
    { role: "user", words: [w("Where's", 3.2, 3.5), w("my", 3.55, 3.7), w("order?", 3.75, 4.2)] },
    {
      role: "agent",
      words: [
        w("Hello,", 0, 0.4),
        w("how", 0.5, 0.7),
        w("can", 0.75, 0.9),
        w("I", 0.95, 1),
        w("help?", 1.05, 1.5),
      ],
    },
    {
      role: "agent",
      interruptedAt: 6.1,
      words: [
        w("Let", 5, 5.2),
        w("me", 5.25, 5.4),
        w("check", 5.45, 5.9),
        w("that", 6.2, 6.4),
        w("now.", 6.45, 6.8),
      ],
    },
    { role: "user", words: [w("Actually", 6.0, 6.5), w("wait", 6.6, 7)] },
  ],
  events: [
    { type: "tool_call", name: "lookup_order", at: 4.4, end: 4.9, status: "ok" },
    { type: "verdict", judge: "task", pass: true, at: 7 },
  ],
});

describe("createConversation", () => {
  it("sorts turns, gives ids, and builds text and times from the words", () => {
    expect(call.turns.map((t) => t.role)).toEqual(["agent", "user", "agent", "user"]);
    expect(call.turns[0]).toMatchObject({ id: "t1", start: 0, end: 1.5, text: "Hello, how can I help?" });
    expect(call.events.map((e) => e.id)).toEqual(["e0", "e1"]);
    expect(call.duration).toBe(7);
  });
});

describe("turnAt and wordAt", () => {
  it("finds the word being said, and holds it through the gap after it", () => {
    expect(wordAt(call, 0.6)).toMatchObject({ index: 1 });
    expect(wordAt(call, 0.72)).toMatchObject({ index: 1 });
    expect(turnAt(call, 2)).toBeUndefined();
    expect(wordAt(call, 2)).toBeUndefined();
  });

  it("gives the later turn during a barge-in, and never an unspoken word", () => {
    expect(turnAt(call, 6.3)?.role).toBe("user");
    const agent = call.turns[2]!;
    expect(wordAt({ ...call, turns: [agent] }, 6.3)).toBeUndefined();
    expect(wordAt({ ...call, turns: [agent] }, 5.5)).toMatchObject({ index: 2 });
  });
});

describe("turn navigation", () => {
  it("steps to the next turn, and back to this turn's start or the one before", () => {
    expect(nextTurn(call, 0)?.start).toBe(3.2);
    expect(nextTurn(call, 3.2)?.start).toBe(5);
    expect(prevTurn(call, 4.5)?.start).toBe(3.2);
    expect(prevTurn(call, 3.4)?.start).toBe(0);
    expect(nextTurn(call, 0, "agent")?.start).toBe(5);
  });
});

describe("events and latency", () => {
  it("finds events touching a range", () => {
    expect(eventsIn(call, 4.8, 5).map((e) => e.type)).toEqual(["tool_call"]);
  });

  it("measures the wait after each user turn the agent answers", () => {
    expect(measureLatency(call)).toEqual([
      { type: "latency", kind: "e2e", id: "latency-t0", at: 4.2, end: 5, turnId: "t2" },
    ]);
  });
});

describe("formatTime", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
  });
});

describe("overlaps, gaps and word steps", () => {
  it("finds the talk-over at a barge-in", () => {
    expect(overlaps(call).map((o) => [o.start, o.end, o.talking.id, o.barging.id])).toEqual([
      [6, 6.1, "t2", "t3"],
    ]);
  });

  it("finds the silences between turns", () => {
    expect(gaps(call, 1).map((g) => [g.start, g.end])).toEqual([[1.5, 3.2]]);
    expect(gaps(call).map((g) => [g.start, g.end])).toEqual([
      [1.5, 3.2],
      [4.2, 5],
    ]);
  });

  it("steps word by word, skipping unspoken ones", () => {
    expect(stepWord(call, 0.6, 1)).toBe(0.75);
    expect(stepWord(call, 1.5, 1)).toBe(3.2);
    expect(stepWord(call, 3.2, -1)).toBe(1.05);
    expect(stepWord(call, 6.0, 1)).toBe(6.6);
  });
});
