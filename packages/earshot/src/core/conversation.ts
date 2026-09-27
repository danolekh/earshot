/* Building a conversation from what a caller has, and the questions every part asks of it: what's
 * being said at a moment, where the turns are, what happened in a range. Pure functions. */

import type {
  Conversation,
  ConversationEvent,
  ConversationInput,
  LatencyEvent,
  Peaks,
  Role,
  Turn,
  Word,
} from "./types";

const joinWords = (words: readonly Word[]): string =>
  words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1");

/** A conversation from partial input: turns sorted, given ids, text built from words, start and
 * end taken from the words, and the duration covering everything. */
export function createConversation(input: ConversationInput): Conversation {
  const turns: Turn[] = input.turns
    .map((t, i): Turn => {
      const words = [...t.words].sort((a, b) => a.start - b.start);
      const start = t.start ?? words[0]?.start ?? 0;
      const end = t.end ?? words.at(-1)?.end ?? start;
      return {
        ...t,
        id: t.id ?? `t${i}`,
        start,
        end,
        words,
        text: t.text ?? joinWords(words),
      };
    })
    .sort((a, b) => a.start - b.start);
  const events = (input.events ?? [])
    .map((e, i) => ({ ...e, id: e.id ?? `e${i}` }) as ConversationEvent)
    .sort((a, b) => a.at - b.at);
  const last = Math.max(
    0,
    ...turns.map((t) => t.end),
    ...events.map((e) => ("end" in e && e.end !== undefined ? e.end : e.at)),
  );
  return {
    ...(input.id !== undefined && { id: input.id }),
    duration: Math.max(input.duration ?? 0, last),
    turns,
    events,
    ...(input.peaks && { peaks: input.peaks }),
  };
}

/** The index of the last item starting at or before `t`, or -1. */
function lastAtOrBefore<T>(items: readonly T[], t: number, start: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (start(items[mid]!) <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The turn being spoken at `t`, if any. Overlapping speech (a barge-in) gives the later turn. */
export function turnAt(c: Conversation, t: number): Turn | undefined {
  for (let i = lastAtOrBefore(c.turns, t, (x) => x.start); i >= 0; i--) {
    const turn = c.turns[i]!;
    if (t <= turn.end) return turn;
    // Earlier turns may still overlap a later one's start; stop once they can't.
    if (i > 0 && c.turns[i - 1]!.end < turn.start) break;
  }
  return undefined;
}

/** Where a turn's speech stops: at its interruption, or its end. */
export const spokenUntil = (turn: Turn): number => Math.min(turn.end, turn.interruptedAt ?? Infinity);

/** Whether a word was actually heard: it started before the turn was cut off. */
export const isSpoken = (turn: Turn, word: Word): boolean =>
  turn.interruptedAt === undefined || word.start < turn.interruptedAt;

/** The word being said at `t` (its index in its turn), or the last word before it in the same
 * turn, during the short pauses between words. */
export function wordAt(c: Conversation, t: number): { turn: Turn; index: number } | undefined {
  const turn = turnAt(c, t);
  if (!turn || t > spokenUntil(turn)) return undefined;
  const index = lastAtOrBefore(turn.words, t, (w) => w.start);
  if (index < 0 || !isSpoken(turn, turn.words[index]!)) return undefined;
  return { turn, index };
}

/** The first turn starting after `t` (with a little slack, so pressing "next" at a turn's start
 * moves on). */
export function nextTurn(c: Conversation, t: number, role?: Role): Turn | undefined {
  return c.turns.find((x) => x.start > t + 0.05 && (!role || x.role === role));
}

/** The turn to go back to from `t`: the current one's start, or the one before if `t` is already
 * within a second of it, as a media player's "previous" does. */
export function prevTurn(c: Conversation, t: number, role?: Role): Turn | undefined {
  const turns = c.turns.filter((x) => !role || x.role === role);
  const i = lastAtOrBefore(turns, t, (x) => x.start);
  if (i < 0) return undefined;
  if (t - turns[i]!.start > 1) return turns[i];
  return turns[i - 1] ?? turns[i];
}

/** The events whose time (or span) touches `[from, to]`. */
export function eventsIn(c: Conversation, from: number, to: number): ConversationEvent[] {
  return c.events.filter((e) => {
    const end = "end" in e && e.end !== undefined ? e.end : e.at;
    return e.at <= to && end >= from;
  });
}

/** The waits the caller heard: from the end of each user turn to the start of the agent turn
 * after it. Adds nothing where the conversation already has `e2e` latency events. */
export function measureLatency(c: Conversation): LatencyEvent[] {
  if (c.events.some((e) => e.type === "latency" && e.kind === "e2e")) return [];
  const out: LatencyEvent[] = [];
  c.turns.forEach((turn, i) => {
    if (turn.role !== "user") return;
    const reply = c.turns.slice(i + 1).find((x) => x.role === "agent");
    if (!reply || reply.start < turn.end) return;
    const next = c.turns[i + 1];
    // Only when the agent answers this turn, not after the user speaks again.
    if (next && next !== reply && next.start < reply.start) return;
    out.push({
      type: "latency",
      kind: "e2e",
      id: `latency-${turn.id}`,
      at: turn.end,
      end: reply.start,
      turnId: reply.id,
    });
  });
  return out;
}

/** The overview for one role, or the mixed one. */
export function peaksFor(c: Conversation, role?: Role): Peaks | undefined {
  const p = c.peaks;
  if (!p) return undefined;
  if ("data" in p) return p as Peaks;
  const byRole = p as Partial<Record<Role, Peaks>>;
  return role ? byRole[role] : (byRole.agent ?? byRole.user);
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Where the caller and the agent talked at once: each span, the turn that was talking and the
 * one that cut in. */
export function overlaps(c: Conversation): { start: number; end: number; talking: Turn; barging: Turn }[] {
  const out: { start: number; end: number; talking: Turn; barging: Turn }[] = [];
  c.turns.forEach((a, i) => {
    for (const b of c.turns.slice(i + 1)) {
      if (b.start >= spokenUntil(a)) break;
      if (b.role === a.role) continue;
      const end = Math.min(spokenUntil(a), spokenUntil(b));
      if (end > b.start) out.push({ start: b.start, end, talking: a, barging: b });
    }
  });
  return out;
}

/** The silences between turns at least `min` seconds long: after `before`, until `after`. */
export function gaps(c: Conversation, min = 0): { start: number; end: number; before: Turn; after: Turn }[] {
  const out: { start: number; end: number; before: Turn; after: Turn }[] = [];
  let reach = -Infinity;
  let last: Turn | undefined;
  for (const t of c.turns) {
    if (last && t.start - reach >= min && t.start > reach)
      out.push({ start: reach, end: t.start, before: last, after: t });
    if (spokenUntil(t) >= reach) {
      reach = spokenUntil(t);
      last = t;
    }
  }
  return out;
}

/** The start of the word after the one at `t` (or of the next turn), and of the one before, for
 * stepping through a call word by word. */
export function stepWord(c: Conversation, t: number, direction: 1 | -1): number | undefined {
  const starts = c.turns.flatMap((turn) => turn.words.filter((w) => isSpoken(turn, w)).map((w) => w.start));
  starts.sort((a, b) => a - b);
  if (direction > 0) return starts.find((s) => s > t + 0.01);
  for (let i = starts.length - 1; i >= 0; i--) if (starts[i]! < t - 0.15) return starts[i];
  return undefined;
}
