/* The one model every part reads: a conversation as turns of timed words plus the events around
 * them. Times are seconds from the start of the recording (or of the live call). Plain JSON, so a
 * call stored in a database renders as it was. */

export type Role = "user" | "agent" | "system";

export interface Word {
  text: string;
  start: number;
  end: number;
  /** 0..1, as the recogniser reported it. */
  confidence?: number;
}

export interface Turn {
  id: string;
  role: Role;
  start: number;
  end: number;
  /** The whole turn's text. Built from the words when it's left out. */
  text: string;
  /** Timed words; may be empty while a live turn streams text without timings. */
  words: readonly Word[];
  /** A label for the speaker when there are several of one role ("Caller", "Anna"). */
  speaker?: string;
  /** When the agent was cut off: the words after it were generated but never spoken. */
  interruptedAt?: number;
  /** False while a live turn is still streaming. */
  final?: boolean;
  /** A live turn's tentative tail: what the recogniser thinks it heard so far, which may still
   * change (speech recognition's interim results). Shown after the words, then replaced. */
  interim?: string;
}

interface EventBase {
  id: string;
  /** When it happened, in seconds. */
  at: number;
  /** The turn it belongs to, when there is one. */
  turnId?: string;
}

export interface ToolCallEvent extends EventBase {
  type: "tool_call";
  name: string;
  /** When the result came back. */
  end?: number;
  args?: unknown;
  result?: unknown;
  status?: "pending" | "ok" | "error";
}

export interface IntentEvent extends EventBase {
  type: "intent";
  label: string;
  confidence?: number;
}

/** A wait the caller heard, or one stage of it: `e2e` from the end of the caller's speech to the
 * agent's first sound; `stt`, `llm` and `tts` the parts of it. */
export interface LatencyEvent extends EventBase {
  type: "latency";
  kind: "e2e" | "stt" | "llm" | "tts" | (string & {});
  end: number;
}

/** A judge's call on the conversation or on one moment of it (an evaluation run). */
export interface VerdictEvent extends EventBase {
  type: "verdict";
  judge: string;
  pass: boolean;
  /** 0..1. */
  score?: number;
  reason?: string;
}

export interface HandoffEvent extends EventBase {
  type: "handoff";
  to: string;
}

/** Anything else worth a mark on the timeline. */
export interface NoteEvent extends EventBase {
  type: "note";
  label: string;
}

export type ConversationEvent =
  | ToolCallEvent
  | IntentEvent
  | LatencyEvent
  | VerdictEvent
  | HandoffEvent
  | NoteEvent;

/** A waveform overview: `data` holds peak amplitudes 0..1, `rate` of them per second. */
export interface Peaks {
  data: readonly number[];
  rate: number;
}

export interface Conversation {
  id?: string;
  /** Seconds; at least the end of the last turn or event. */
  duration: number;
  turns: readonly Turn[];
  events: readonly ConversationEvent[];
  /** One overview for the mixed recording, or one per role for a stereo call. */
  peaks?: Peaks | Readonly<Partial<Record<Role, Peaks>>>;
}

/** What a caller hands in: ids, text, finality and the duration may be left out. */
export interface ConversationInput {
  id?: string;
  duration?: number;
  turns: readonly TurnInput[];
  events?: readonly EventInput[];
  peaks?: Conversation["peaks"];
}

export type TurnInput = Omit<Turn, "id" | "text" | "start" | "end"> & {
  id?: string;
  text?: string;
  start?: number;
  end?: number;
};

export type EventInput = ConversationEvent extends infer E
  ? E extends ConversationEvent
    ? Omit<E, "id"> & { id?: string }
    : never
  : never;
