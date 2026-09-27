import { measuredSpeech } from "../trace/speech";
/* What `readCall` works out when no source gave it, in order: words tied to their turns, guessed
 * turn edges moved onto the words or speech that show them, turn ids, which caller turn each reply
 * answers, keys turned into ids, an interruption for each reply cut off, words spread over turns
 * that have none, and finding ids. Each step leaves alone whatever a source already supplied. */
import type {
  CallMeta,
  CallTraceInput,
  Channel,
  Finding,
  Interval,
  TraceSignal,
  TraceTurn,
  TraceWord,
  WithoutId,
} from "../trace/types";
import type { MergedCall, SignalDraft, TurnDraft, WordDraft } from "./read";
import { spreadWords } from "./vtt";

type TurnInput = CallTraceInput["turns"][number];

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const mid = (w: { start: number; end: number }) => (w.start + w.end) / 2;

/** Words with no turn, tied to the turn of their channel they fall in: the latest to have started
 * by their middle, while it lasts (to the next one, when its end is a guess). A word just before a
 * guessed start goes to that turn. */
function tieWords(turns: readonly TurnDraft[], words: readonly WordDraft[]): WordDraft[] {
  const byChannel = (ch: Channel) => turns.filter((t) => t.channel === ch).sort((a, b) => a.start - b.start);
  const lists = { caller: byChannel("caller"), agent: byChannel("agent") };
  return words.map((w) => {
    if (w.turnKey !== undefined || w.turnId !== undefined) return w;
    const list = lists[w.channel];
    const m = mid(w);
    let i = list.length - 1;
    while (i >= 0 && list[i]!.start > m + 0.05) i--;
    const at = list[i];
    if (at && (m <= at.end + 0.05 || at.estimated?.includes("end"))) return { ...w, turnKey: at.key };
    const next = list[i + 1];
    if (next?.estimated?.includes("start") && next.start - m < 1) return { ...w, turnKey: next.key };
    return w;
  });
}

/** The words that show when a turn was spoken: the caller's aligned words (else what the
 * recogniser heard), the agent's words that played. */
function timedWordsOf(turn: TurnDraft, words: readonly WordDraft[]): WordDraft[] {
  const own = words.filter((w) => w.turnKey === turn.key && !w.estimated);
  if (turn.channel === "agent") return own.filter((w) => w.source === "tts" && w.heard !== false);
  const aligned = own.filter((w) => w.source === "aligned");
  return aligned.length ? aligned : own.filter((w) => w.source === "streaming_asr");
}

/** A turn with its guessed edges moved onto its words, else onto the speech of its channel that
 * starts inside it. What's still a guess is reported. */
function refine(
  turn: TurnDraft,
  words: readonly WordDraft[],
  speech: readonly Interval[],
): { turn: TurnDraft; guessed: boolean } {
  const edges = new Set(turn.estimated ?? []);
  if (!edges.size) return { turn, guessed: false };
  let { start, end } = turn;
  const timed = timedWordsOf(turn, words);
  if (timed.length) {
    if (edges.delete("start")) start = Math.min(...timed.map((w) => w.start));
    if (edges.delete("end")) end = Math.max(...timed.map((w) => w.end));
  } else {
    const runs = speech.filter((r) => r.start >= start - 0.05 && r.start < end);
    if (runs.length) {
      if (edges.delete("start")) start = runs[0]!.start;
      if (edges.delete("end")) end = runs.at(-1)!.end;
    }
  }
  const moved = end !== turn.end && turn.interrupted ? { interrupted: { ...turn.interrupted, at: end } } : {};
  return {
    turn: { ...turn, start: round3(start), end: round3(Math.max(end, start)), ...moved },
    guessed: edges.size > 0,
  };
}

/** Words spread over a turn's time, for a turn nothing timed: an interrupted agent turn is spread
 * over what it would have taken to say, so only the words before the cut count as heard. */
function estimatedWords(t: TraceTurn): WithoutId<TraceWord>[] {
  const spoken = t.interrupted ? Math.max(t.end - t.start, 0.2) : t.end - t.start;
  const end =
    t.channel === "agent" && t.interrupted ? t.start + Math.max(spoken, t.text.length * 0.065) : t.end;
  return spreadWords(t.text, t.start, end).map((w) => ({
    ...w,
    channel: t.channel,
    source: t.channel === "agent" ? ("tts" as const) : ("streaming_asr" as const),
    turnId: t.id,
    estimated: true,
    ...(t.channel === "agent" && { heard: !t.interrupted || w.start < t.interrupted.at }),
  }));
}

export function deriveTrace(m: MergedCall): CallTraceInput {
  const speechOf = (ch: Channel): readonly Interval[] =>
    measuredSpeech({ ...(m.speech && { speech: m.speech }), turns: m.turns }, ch) ?? [];
  const tied = tieWords(m.turns, m.words);
  const refined = m.turns.map((t) => refine(t, tied, speechOf(t.channel)));
  const guessed = new Set(refined.filter((r) => r.guessed).map((r) => r.turn.key));
  const sorted = refined.map((r) => r.turn).sort((a, b) => a.start - b.start);
  const idOf = new Map(sorted.map((t, i) => [t.key, `t${i}`]));

  const turns: TraceTurn[] = sorted.map((d, i) => {
    const { key, replyTo, estimated: _, ...rest } = d;
    const out: TraceTurn = { ...rest, id: `t${i}`, ...(guessed.has(key) && { estimated: true }) };
    if (d.channel !== "agent") return out;
    // The caller turn it answers: the last one that had finished when the agent started speaking.
    const asked =
      replyTo !== undefined
        ? idOf.get(replyTo)
        : idOf.get(sorted.filter((x) => x.channel === "caller" && x.end <= d.start + 0.05).at(-1)?.key ?? "");
    return asked !== undefined ? { ...out, replyTo: asked } : out;
  });

  const resolve = <T extends { turnKey?: string; turnId?: string }>(x: T): Omit<T, "turnKey"> => {
    const { turnKey, ...rest } = x;
    const turnId = turnKey !== undefined ? idOf.get(turnKey) : undefined;
    return turnId !== undefined ? { ...rest, turnId } : rest;
  };
  const spans = m.spans.map(resolve);
  const signals = m.signals.map((s) => resolve(s as SignalDraft)) as WithoutId<TraceSignal>[];
  const words = tied.map(resolve) as WithoutId<TraceWord>[];

  // An interrupted reply: the caller was talking while it played, and it stopped. The overlap
  // starts when both are talking (the caller may have started first).
  const told = new Set(signals.filter((s) => s.type === "interruption").map((s) => s.turnId));
  for (const turn of turns) {
    const cut = turn.interrupted?.at;
    if (cut === undefined || told.has(turn.id)) continue;
    const by = turns.filter((t) => t.channel === "caller" && t.start < cut && t.end > turn.start).at(-1);
    if (!by) continue;
    const at = Math.max(by.start, turn.start);
    signals.push({
      type: "interruption",
      at,
      channel: "caller",
      turnId: turn.id,
      data: { decision: "stop", stopAfter: round3(cut - at) },
    });
  }

  // Words for the turns no source timed: the agent's generated words, what the caller was heard
  // saying, spread over each turn.
  const have = new Set(words.map((w) => `${w.channel}:${w.source}`));
  for (const t of turns)
    if (!have.has(`${t.channel}:${t.channel === "agent" ? "tts" : "streaming_asr"}`))
      words.push(...estimatedWords(t));

  const findings: Finding[] = m.findings.map((f) => {
    const { id, evidence, ...rest } = resolve(f);
    const turnId = (rest as { turnId?: string }).turnId;
    return {
      ...rest,
      id: id ?? `${f.type}:${turnId ?? f.start.toFixed(2)}`,
      evidence: evidence ?? (turnId !== undefined ? [turnId] : []),
    };
  });

  return {
    call: m.call as Omit<CallMeta, "duration">,
    clock: m.clock,
    ...(m.audio && { audio: m.audio }),
    ...(m.speech && { speech: m.speech }),
    turns: turns as TurnInput[],
    spans,
    signals,
    words,
    findings,
  };
}
