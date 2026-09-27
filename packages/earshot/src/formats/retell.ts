/* Retell's call object (`GET /v2/get-call/:id`): `transcript_object` holds the turns with word
 * timings in seconds; `latency.e2e` its percentiles, which aren't per turn, so they're left out. */

import { createConversation } from "../core/conversation";
import type { Conversation } from "../core/types";

export interface RetellCall {
  call_id?: string;
  duration_ms?: number;
  transcript_object?: readonly {
    role: "agent" | "user" | (string & {});
    content: string;
    words?: readonly { word: string; start: number; end: number }[];
  }[];
}

export function fromRetell(call: RetellCall): Conversation {
  return createConversation({
    ...(call.call_id && { id: call.call_id }),
    ...(call.duration_ms !== undefined && { duration: call.duration_ms / 1000 }),
    turns: (call.transcript_object ?? []).map((t) => ({
      role: t.role === "agent" ? "agent" : t.role === "user" ? "user" : "system",
      text: t.content,
      words: (t.words ?? []).map((w) => ({ text: w.word.trim(), start: w.start, end: w.end })),
    })),
  });
}
