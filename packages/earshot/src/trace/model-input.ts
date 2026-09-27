/* What the model was given for a reply: the messages on the reply's model request, and how many of
 * them the request before already had (the rest are new). Read off the normalized `llm` of the
 * turn's spans, whichever stack recorded them. */
import type { CallTrace, ChatMessage, TraceSpan } from "./types";

export interface ModelInput {
  messages: readonly ChatMessage[];
  /** How many the request before had: the rest are new. */
  before: number;
  /** The request's span. */
  spanId: string;
}

const withMessages = (s: TraceSpan) => (s.llm?.messages?.length ?? 0) > 0;

export function modelInput(trace: CallTrace, turnId: string): ModelInput | undefined {
  const request = trace.spans.find((s) => s.turnId === turnId && withMessages(s));
  if (!request) return undefined;
  const previous = trace.spans.filter((s) => withMessages(s) && s.start < request.start).at(-1);
  return {
    messages: request.llm!.messages!,
    before: previous?.llm?.messages?.length ?? 0,
    spanId: request.id,
  };
}
