/* Building a call trace from partial input, projecting it onto the plain `Conversation` every other
 * part reads, and the lookups the debugger asks of it. Pure functions. */

import { createConversation } from "../core/conversation";
import { decodePeakLevel, peaksFromLevel } from "../core/pyramid";
import type { Conversation, ConversationEvent, Peaks, Role, Turn, Word } from "../core/types";
import { speechEnd } from "./latency";
import type {
  CallTrace,
  CallTraceInput,
  Channel,
  EouDecisionSignal,
  SignalType,
  TraceSignal,
  TraceSpan,
  TraceTurn,
  TraceWord,
  WordSource,
} from "./types";

const joinWords = (words: readonly { text: string }[]): string =>
  words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1");

/** The turn of `channel` a moment belongs to: the one it falls in, with a little slack. */
function turnFor(turns: readonly TraceTurn[], channel: Channel, t: number): TraceTurn | undefined {
  return turns.find((x) => x.channel === channel && t >= x.start - 0.05 && t <= x.end + 0.05);
}

/** The words a turn is shown with: what was said for the caller (what the agent heard when
 * nothing was aligned), what the agent generated for the agent. */
function wordsShown(words: readonly TraceWord[], turn: TraceTurn): TraceWord[] {
  const own = words.filter((w) => w.turnId === turn.id);
  const pick = (source: WordSource) => own.filter((w) => w.source === source);
  if (turn.channel === "agent") return pick("tts");
  const aligned = pick("aligned");
  return aligned.length ? aligned : pick("streaming_asr");
}

/** A trace from partial input: everything sorted, given ids, words tied to their turns, turn text
 * built from the words, and the duration covering everything. */
export function createTrace(input: CallTraceInput): CallTrace {
  const turns: TraceTurn[] = [...input.turns]
    .sort((a, b) => a.start - b.start)
    .map((t, i) => ({ ...t, id: t.id ?? `t${i}`, text: t.text ?? "" }));
  const words: TraceWord[] = [...(input.words ?? [])]
    .sort((a, b) => a.start - b.start)
    .map((w, i) => {
      const turnId = w.turnId ?? turnFor(turns, w.channel, (w.start + w.end) / 2)?.id;
      return { ...w, id: w.id ?? `w${i}`, ...(turnId !== undefined && { turnId }) };
    });
  for (const [i, turn] of turns.entries())
    if (!turn.text) turns[i] = { ...turn, text: joinWords(wordsShown(words, turn)) };
  const spans: TraceSpan[] = [...(input.spans ?? [])]
    .sort((a, b) => a.start - b.start)
    .map((s, i) => ({ ...s, id: s.id ?? `s${i}` }));
  const signals = [...(input.signals ?? [])]
    .sort((a, b) => a.at - b.at)
    .map((s, i) => ({ ...s, id: s.id ?? `g${i}` }) as TraceSignal);
  const findings = [...(input.findings ?? [])].sort((a, b) => a.start - b.start);
  const duration = Math.max(
    input.call.duration ?? 0,
    ...turns.map((t) => t.end),
    ...words.map((w) => w.end),
    ...spans.map((s) => s.end),
    ...signals.map((s) => s.end ?? s.at),
  );
  return {
    version: 1,
    call: { ...input.call, duration },
    clock: input.clock,
    ...(input.audio && { audio: input.audio }),
    turns,
    spans,
    signals,
    words,
    ...(input.speech && { speech: input.speech }),
    findings,
  };
}

const roleOf = (channel: Channel): Role => (channel === "caller" ? "user" : "agent");

const toWord = (w: TraceWord): Word => ({
  text: w.text,
  start: w.start,
  end: w.end,
  ...(w.confidence !== undefined && { confidence: w.confidence }),
});

const conversations = new WeakMap<CallTrace, Conversation>();

/** The trace as a plain conversation, so the player, transcript and timeline parts read it as they
 * read any call: caller turns with the words that were said, agent turns with the words it
 * generated (cut off where it was interrupted), tool spans as tool calls, and each reply's wait. */
export function toConversation(trace: CallTrace): Conversation {
  const cached = conversations.get(trace);
  if (cached) return cached;
  const turns: Turn[] = trace.turns.map((t) => ({
    id: t.id,
    role: roleOf(t.channel),
    start: t.start,
    end: t.end,
    text: t.text,
    words: wordsShown(trace.words, t).map(toWord),
    ...(t.interrupted && { interruptedAt: t.interrupted.at }),
  }));
  const events: ConversationEvent[] = [];
  for (const s of trace.spans) {
    if (s.kind !== "tool") continue;
    events.push({
      type: "tool_call",
      id: s.id,
      at: s.start,
      end: s.end,
      name: s.tool?.name ?? s.name,
      ...(s.tool?.arguments !== undefined && { args: s.tool.arguments }),
      ...(s.tool?.result !== undefined && { result: s.tool.result }),
      status: s.status?.code === "error" || s.tool?.isError ? "error" : "ok",
      ...(s.turnId !== undefined && { turnId: s.turnId }),
    });
  }
  for (const t of trace.turns) {
    const asked = t.replyTo ? turnById(trace, t.replyTo) : undefined;
    if (!asked) continue;
    const at = speechEnd(trace, asked);
    if (t.start > at)
      events.push({ type: "latency", kind: "e2e", id: `latency-${t.id}`, at, end: t.start, turnId: t.id });
  }
  // A peak overview per side; a mono recording's one overview for the whole call.
  const peaks: Partial<Record<Role, Peaks>> = {};
  for (const channel of ["caller", "agent"] as const) {
    const level = trace.audio?.peaks?.[channel];
    if (level) peaks[roleOf(channel)] = peaksFromLevel(decodePeakLevel(level));
  }
  const mixed = trace.audio?.peaks?.mixed;
  const conversation = createConversation({
    id: trace.call.id,
    duration: trace.call.duration,
    turns,
    events,
    ...(Object.keys(peaks).length > 0
      ? { peaks }
      : mixed && { peaks: peaksFromLevel(decodePeakLevel(mixed)) }),
  });
  conversations.set(trace, conversation);
  return conversation;
}

export function turnById(trace: CallTrace, id: string): TraceTurn | undefined {
  return trace.turns.find((t) => t.id === id);
}

export function spanById(trace: CallTrace, id: string): TraceSpan | undefined {
  return trace.spans.find((s) => s.id === id);
}

/** The spans of one turn, in start order. */
export function spansOf(trace: CallTrace, turnId: string): TraceSpan[] {
  return trace.spans.filter((s) => s.turnId === turnId);
}

/** A turn's tool calls. */
export function toolsOf(trace: CallTrace, turnId: string): TraceSpan[] {
  return trace.spans.filter((s) => s.turnId === turnId && s.kind === "tool");
}

/** The turn detector's decisions on a caller turn, in order. */
export function decisionsOf(trace: CallTrace, turnId: string): EouDecisionSignal[] {
  return trace.signals.filter(
    (s): s is EouDecisionSignal => s.type === "eou_decision" && s.turnId === turnId,
  );
}

/** A span's direct children. */
export function childrenOf(trace: CallTrace, spanId: string): TraceSpan[] {
  return trace.spans.filter((s) => s.parentId === spanId);
}

/** Words matching all of the given filters, in start order. */
export function wordsOf(
  trace: CallTrace,
  filter: { channel?: Channel; source?: WordSource; turnId?: string } = {},
): TraceWord[] {
  return trace.words.filter(
    (w) =>
      (filter.channel === undefined || w.channel === filter.channel) &&
      (filter.source === undefined || w.source === filter.source) &&
      (filter.turnId === undefined || w.turnId === filter.turnId),
  );
}

/** The agent turn that answers a caller turn. */
export function replyOf(trace: CallTrace, callerTurnId: string): TraceTurn | undefined {
  return trace.turns.find((t) => t.replyTo === callerTurnId);
}

/** The signals touching `[from, to]`, optionally of one type. */
export function signalsIn(trace: CallTrace, from: number, to: number, type?: SignalType): TraceSignal[] {
  return trace.signals.filter(
    (s) => (type === undefined || s.type === type) && s.at <= to && (s.end ?? s.at) >= from,
  );
}
