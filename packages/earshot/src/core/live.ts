/* A conversation as it happens: turns open, text streams in (with or without word timings), the
 * agent gets cut off, events arrive. A small store any framework can subscribe to; each change
 * makes a new snapshot, so a React part can compare by reference. */

import { createConversation } from "./conversation";
import type { Conversation, ConversationEvent, EventInput, Role, Turn, Word } from "./types";

export interface LiveConversation {
  get(): Conversation;
  subscribe(listener: () => void): () => void;
  /** Opens a turn and returns its id. */
  begin(role: Role, at: number, options?: { id?: string; speaker?: string }): string;
  /** Adds streamed text (a transcript delta) to an open turn. */
  appendText(turnId: string, delta: string): void;
  /** Adds timed words to a turn; its text follows them. */
  appendWords(turnId: string, words: readonly Word[]): void;
  /** Replaces a turn's text outright (a corrected transcript). */
  setText(turnId: string, text: string): void;
  /** Sets a turn's tentative tail (interim recognition), replacing the last one; "" clears it. */
  setInterim(turnId: string, text: string): void;
  /** Closes a turn at `at`. */
  finalize(turnId: string, at: number): void;
  /** The caller barged in at `at`: the turn stops there, and the words after it stay as unspoken. */
  truncate(turnId: string, at: number): void;
  addEvent(event: EventInput): string;
  /** Moves the conversation's end, so a live timeline grows with the call. */
  setNow(at: number): void;
  /** Starts over: no turns, no events, no duration. */
  clear(): void;
}

const joinText = (a: string, b: string) =>
  a && b && !/^[\s,.!?;:]/.test(b) && !/\s$/.test(a) ? `${a} ${b}` : a + b;

export function createLiveConversation(initial?: Conversation): LiveConversation {
  let snapshot: Conversation = initial ?? { duration: 0, turns: [], events: [] };
  const listeners = new Set<() => void>();
  let ids = snapshot.turns.length + snapshot.events.length;

  const commit = (next: Omit<Conversation, "duration"> & { duration?: number }) => {
    snapshot = createConversation({ ...next, duration: Math.max(next.duration ?? 0, snapshot.duration) });
    listeners.forEach((l) => l());
  };

  const withTurn = (turnId: string, change: (turn: Turn) => Turn) => {
    const turns = snapshot.turns.map((t) => (t.id === turnId ? change(t) : t));
    commit({ ...snapshot, turns });
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    begin(role, at, options) {
      const id = options?.id ?? `live-${ids++}`;
      const turn: Turn = {
        id,
        role,
        start: at,
        end: at,
        text: "",
        words: [],
        final: false,
        ...(options?.speaker && { speaker: options.speaker }),
      };
      commit({ ...snapshot, turns: [...snapshot.turns, turn] });
      return id;
    },
    appendText(turnId, delta) {
      withTurn(turnId, (t) => ({ ...t, text: joinText(t.text, delta) }));
    },
    appendWords(turnId, words) {
      withTurn(turnId, (t) => {
        const all = [...t.words, ...words];
        return {
          ...t,
          words: all,
          text: joinText(t.text, words.map((w) => w.text).join(" ")),
          end: Math.max(t.end, all.at(-1)?.end ?? t.end),
        };
      });
    },
    setText(turnId, text) {
      withTurn(turnId, (t) => ({ ...t, text }));
    },
    setInterim(turnId, text) {
      withTurn(turnId, (t) => {
        const { interim: _, ...rest } = t;
        return text ? { ...rest, interim: text } : rest;
      });
    },
    finalize(turnId, at) {
      withTurn(turnId, (t) => {
        const { interim: _, ...rest } = t;
        return { ...rest, end: Math.max(t.start, at), final: true };
      });
    },
    truncate(turnId, at) {
      withTurn(turnId, (t) => ({ ...t, interruptedAt: at, end: Math.max(t.start, at), final: true }));
    },
    addEvent(event) {
      const id = event.id ?? `live-${ids++}`;
      commit({ ...snapshot, events: [...snapshot.events, { ...event, id } as ConversationEvent] });
      return id;
    },
    clear() {
      snapshot = { duration: 0, turns: [], events: [] };
      listeners.forEach((l) => l());
    },
    setNow(at) {
      if (at <= snapshot.duration) return;
      snapshot = { ...snapshot, duration: at };
      listeners.forEach((l) => l());
    },
  };
}
