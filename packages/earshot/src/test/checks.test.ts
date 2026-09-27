import { describe, expect, it } from "vitest";

import { anchorScore, findAnchor, runTestCase, type TestCase } from "../trace/checks";
import { createTrace } from "../trace/trace";
import type { CallTrace } from "../trace/types";

/** A call from its turns, each caller turn heard as `heard` (what the recogniser got). */
function call(
  id: string,
  turns: { channel: "caller" | "agent"; start: number; end: number; text: string; heard?: string }[],
): CallTrace {
  const input = turns.map((t, i) => ({
    id: `t${i}`,
    channel: t.channel,
    start: t.start,
    end: t.end,
    text: t.text,
    ...(t.channel === "agent" && i > 0 && turns[i - 1]!.channel === "caller" && { replyTo: `t${i - 1}` }),
  }));
  const words = turns.flatMap((t, i) =>
    t.channel === "caller"
      ? [
          ...t.text.split(" ").map((w) => ({
            text: w,
            start: t.start,
            end: t.end,
            channel: "caller" as const,
            source: "aligned" as const,
            turnId: `t${i}`,
          })),
          ...(t.heard ?? t.text).split(" ").map((w) => ({
            text: w,
            start: t.start,
            end: t.end,
            channel: "caller" as const,
            source: "streaming_asr" as const,
            turnId: `t${i}`,
          })),
        ]
      : [],
  );
  return createTrace({
    call: { id, duration: 30 },
    clock: { t0UnixMs: 0, channels: ["caller", "agent"] },
    turns: input,
    words,
  });
}

// The bad call: the number split over two turns, and "null" not heard on the repeat.
const v42 = call("v42", [
  { channel: "agent", start: 0, end: 2, text: "Ihre Kundennummer bitte?" },
  { channel: "caller", start: 3, end: 4.5, text: "Ja, die ist vier sieben eins" },
  { channel: "agent", start: 4.8, end: 6, text: "Danke, ich habe die vier sieben eins notiert." },
  {
    channel: "caller",
    start: 7,
    end: 9,
    text: "Vier sieben eins null acht drei.",
    heard: "Vier sieben eins acht drei.",
  },
  { channel: "agent", start: 9.5, end: 11, text: "Unter der Nummer finde ich nichts." },
]);
// The fixed call: one turn for the whole number, all of it heard, a quick reply.
const v43 = call("v43", [
  { channel: "agent", start: 0, end: 2, text: "Ihre Kundennummer bitte?" },
  { channel: "caller", start: 3, end: 6, text: "Ja, die ist vier sieben eins null acht drei." },
  { channel: "agent", start: 6.6, end: 8, text: "Danke, Frau Keller, ich habe Sie gefunden." },
]);

const test: TestCase = {
  version: 1,
  name: "number heard",
  source: { callId: "v42", turns: ["t3", "t4"], at: 7 },
  context: {},
  checks: [
    {
      kind: "hears",
      text: "vier sieben eins null acht drei",
      turn: "t3",
      at: { said: "Vier sieben eins null acht drei." },
    },
    {
      kind: "reply_within",
      seconds: 1.5,
      turn: "t4",
      at: { said: "Vier sieben eins null acht drei.", reply: true },
    },
    { kind: "hears", text: "Hallo", turn: "t9", at: { said: "Hallo? Sind Sie noch da?" } },
  ],
};

describe("anchors", () => {
  it("score how much of what was said a turn says, in order", () => {
    expect(
      anchorScore("vier sieben eins null acht drei", "Ja, die ist vier sieben eins null acht drei."),
    ).toBe(1);
    expect(anchorScore("vier sieben eins null acht drei", "Vier sieben eins acht drei.")).toBeCloseTo(5 / 6);
    expect(anchorScore("drei acht", "acht drei")).toBe(0.5);
    expect(anchorScore("", "anything")).toBe(0);
  });

  it("find the caller turn, or the agent's reply to it, on another call", () => {
    expect(findAnchor(v43, { said: "Vier sieben eins null acht drei." })?.id).toBe("t1");
    expect(findAnchor(v43, { said: "Vier sieben eins null acht drei.", reply: true })?.id).toBe("t2");
    expect(findAnchor(v43, { said: "Hallo? Sind Sie noch da?" })).toBeNull();
  });
});

describe("running a test case", () => {
  it("fails on its own call, by turn id", () => {
    const [hears, reply] = runTestCase(v42, test);
    expect(hears).toMatchObject({ status: "fail", turn: "t3", measured: "“null” not heard" });
    expect(reply).toMatchObject({ status: "pass", turn: "t4" });
  });

  it("passes on the fixed call, following the conversation, and says what it can't find", () => {
    const [hears, reply, hello] = runTestCase(v43, test);
    expect(hears).toMatchObject({ status: "pass", turn: "t1" });
    expect(reply).toMatchObject({ status: "pass", turn: "t2", measured: "waited 0.60 s" });
    expect(hello).toMatchObject({ status: "missing", pass: false });
    expect(hello!.measured).toContain("Hallo? Sind Sie noch da?");
  });
});
