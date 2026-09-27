import { type Clock, createVirtualClock } from "../core/clock";
import { createConversation } from "../core/conversation";
import type { Conversation } from "../core/types";

const w = (text: string, start: number, end: number) => ({ text, start, end });

export const call: Conversation = createConversation({
  turns: [
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
      role: "user",
      speaker: "Anna",
      words: [w("Where's", 3.2, 3.5), w("my", 3.55, 3.7), w("order?", 3.75, 4.2)],
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
    { role: "user", speaker: "Anna", words: [w("Actually", 6.0, 6.5), w("wait", 6.6, 7)] },
  ],
  events: [
    { type: "tool_call", name: "lookup_order", at: 4.4, end: 4.9, status: "ok", turnId: "t2" },
    { type: "verdict", judge: "Task success", pass: false, at: 7 },
  ],
});

/** A clock the test moves by hand. */
export function manualClock(duration: number = call.duration): Clock {
  return createVirtualClock(duration, {
    env: { now: () => 0, requestFrame: () => 0, cancelFrame: () => {} },
  });
}
