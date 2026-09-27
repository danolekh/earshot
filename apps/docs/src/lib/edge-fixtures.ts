/* Awkward calls for the /edge page: the shapes real data takes that a demo never does. */
import { type Conversation, createConversation, type TurnInput } from "@danolekh/earshot/core";
import { spreadWords } from "@danolekh/earshot/formats";

const LOREM =
  "so I was saying that the policy should cover the flat and the car and honestly I am not sure what the difference is between the two plans you sent me last week";

const turn = (
  role: "agent" | "user",
  text: string,
  start: number,
  end: number,
  extra: Partial<TurnInput> = {},
): TurnInput => ({
  role,
  text,
  words: spreadWords(text, start, end),
  start,
  end,
  ...extra,
});

export const EDGE: { id: string; title: string; call: Conversation }[] = [
  {
    id: "long-turn",
    title: "One very long turn (400 words)",
    call: createConversation({
      turns: [
        turn("agent", "Hello, how can I help?", 0, 1.4),
        turn("user", Array.from({ length: 12 }, () => LOREM).join(" "), 2, 160),
        turn("agent", "Got it.", 161, 161.8),
      ],
    }),
  },
  {
    id: "one-word",
    title: "One-word turns, no events",
    call: createConversation({
      turns: [turn("agent", "Hi.", 0, 0.4), turn("user", "Yes.", 1, 1.3), turn("agent", "Bye.", 2, 2.4)],
    }),
  },
  {
    id: "barge-start",
    title: "Barge-in at the very start",
    call: createConversation({
      turns: [
        turn("agent", "Thanks for calling, before we start I need to read you a short notice", 0, 4, {
          interruptedAt: 0.3,
        }),
        turn("user", "Stop, I just need a human please", 0.2, 2.4),
      ],
      events: [{ type: "handoff", to: "Human queue", at: 2.6 }],
    }),
  },
  {
    id: "twenty-minutes",
    title: "A 20-minute call (300 turns)",
    call: createConversation({
      turns: Array.from({ length: 300 }, (_, i) =>
        turn(i % 2 ? "user" : "agent", LOREM.slice(0, 40 + ((i * 37) % 110)), i * 4, i * 4 + 3.2),
      ),
      events: Array.from({ length: 40 }, (_, i) => ({
        type: "tool_call" as const,
        name: `lookup_${i}`,
        at: i * 30 + 3.3,
        end: i * 30 + 3.8,
        turnId: `t${(i * 30) / 4 + 1}`,
      })),
    }),
  },
];
