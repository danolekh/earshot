/* Turns from a transcript of timed messages: what a stack gives when it keeps a transcript, not
 * spans (ElevenLabs Agents; Vapi and Retell have the same shape). Each message is a turn from its
 * start; one with no end runs until the next message, or as long as its words take to say,
 * whichever comes first, and says so, so `readCall` moves it onto the words or the speech that
 * show where it really was. */
import type { Channel, TurnContext, TurnLatency } from "../trace/types";
import type { TurnDraft, TurnEdge } from "./read";

export interface TimedMessage {
  key: string;
  channel: Channel;
  text: string;
  /** Seconds on the call's clock. */
  start: number;
  end?: number;
  /** The start is only as fine as the source keeps it (whole seconds). */
  roughStart?: boolean;
  interrupted?: boolean;
  latency?: TurnLatency;
  context?: TurnContext;
}

/** Seconds per character of speech, for a message with no end. */
const PER_CHAR = 0.065;

export function timedTurns(messages: readonly TimedMessage[]): TurnDraft[] {
  const sorted = [...messages].sort((a, b) => a.start - b.start);
  return sorted.map((m, i) => {
    const next = sorted.slice(i + 1).find((x) => x.start > m.start)?.start;
    const said = m.start + Math.max(0.3, m.text.length * PER_CHAR);
    const end = m.end ?? (next === undefined ? said : Math.min(next, said));
    const estimated: TurnEdge[] = [
      ...(m.roughStart ? (["start"] as const) : []),
      ...(m.end === undefined ? (["end"] as const) : []),
    ];
    return {
      key: m.key,
      channel: m.channel,
      start: m.start,
      end,
      text: m.text,
      ...(m.interrupted && { interrupted: { at: end } }),
      ...(m.latency && { latency: m.latency }),
      ...(m.context && { context: m.context }),
      ...(estimated.length > 0 && { estimated }),
    };
  });
}
