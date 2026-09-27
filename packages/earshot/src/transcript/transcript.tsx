"use client";
import { spring } from "math/time";
import type * as React from "react";
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Clock } from "../core/clock";
import { formatTime, gaps, isSpoken, spokenUntil, turnAt, wordAt } from "../core/conversation";
import type { LiveConversation } from "../core/live";
import type { Conversation, ConversationEvent, Turn, Word } from "../core/types";
import {
  describeEvent,
  EN_LABELS,
  PlayerContext,
  type PlayerLabels,
  useClockValue,
  useConversationValue,
  useSelected,
} from "../player/context";
import { createSelection } from "../player/selection";
import { usePrefersReducedMotion } from "../utils/media";
import { type PartProps, usePart } from "../utils/part";
import { VISUALLY_HIDDEN } from "../utils/visually-hidden";

interface TranscriptContextValue {
  conversation: Conversation;
  clock: Clock | null;
  labels: PlayerLabels;
  root: React.RefObject<HTMLElement | null>;
  /** Following playback (or, live, the newest turn) now: on, and not paused by the reader. */
  following: boolean;
  resume: () => void;
  /** Set once the transcript has first rendered: what mounts after it is new (`data-new`). */
  mounted: React.RefObject<boolean>;
}

const TranscriptContext = createContext<TranscriptContextValue | null>(null);
const TurnContext = createContext<Turn | null>(null);

function useTranscript(part: string): TranscriptContextValue {
  const ctx = useContext(TranscriptContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <Transcript.Root>.`);
  return ctx;
}

function useTurn(part: string): Turn {
  const turn = useContext(TurnContext);
  if (!turn) throw new Error(`earshot: <${part}> must be inside <Transcript.Turn>.`);
  return turn;
}

export interface TranscriptRootState extends Record<string, unknown> {
  live: boolean;
  /** Keeping the current turn in view; off once the reader scrolls, until `Transcript.Resume`. */
  following: boolean;
  /** A live turn is still streaming. */
  busy: boolean;
}

export interface TranscriptRootProps extends PartProps<"div", TranscriptRootState> {
  /** The conversation; the enclosing `Player.Root`'s by default. */
  conversation?: Conversation | LiveConversation;
  /** A call in progress: a `role="log"`, `aria-busy` while a turn streams, the newest turn kept in
   * view. */
  live?: boolean;
  /** Reads each finished turn to screen readers (never word by word). Off by default: during a
   * live call the reader would talk over the agent the user is listening to. Turn it on for a
   * text-only call or a caption view. */
  announce?: boolean;
  /** Keeps the turn being played (or, live, the newest) in view inside this element. On by
   * default; the root needs its own scroll (`overflow: auto` and a height). The reader's own
   * scrolling pauses it until `Transcript.Resume`. */
  follow?: boolean;
}

/** A conversation's transcript. Put `Transcript.Turn`s inside, or `Transcript.Turns` for all of
 * them. Inside a `Player.Root` it follows playback: the turn and word being played are marked, and
 * a word click seeks there. Renders a `<div>`. */
export function TranscriptRoot(props: TranscriptRootProps): React.ReactElement {
  const { conversation: given, live = false, announce = false, follow = true, children, ...rest } = props;
  const player = useContext(PlayerContext);
  if (!given && !player)
    throw new Error("earshot: <Transcript.Root> needs a `conversation`, or a <Player.Root> around it.");
  const conversation = useConversationValue(given ?? player!.conversation);
  const labels = player?.labels ?? EN_LABELS;
  const root = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const following = follow && !paused;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const ctx = useMemo<TranscriptContextValue>(
    () => ({
      conversation,
      clock: player?.clock ?? null,
      labels,
      root,
      following,
      resume: () => setPaused(false),
      mounted,
    }),
    [conversation, player?.clock, labels, following],
  );

  // The reader's own scrolling (wheel, touch, keys; a programmatic scroll fires none of them)
  // pauses following, so it never yanks the text from under them.
  useEffect(() => {
    const el = root.current;
    if (!follow || !el) return;
    const pause = () => setPaused(true);
    // On the window, so it hears a key after everything else has: a key a handler took (the page's
    // own shortcuts, a player's arrows) didn't scroll anything.
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !el.contains(e.target as Node)) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) pause();
    };
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchmove", pause, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("wheel", pause);
      el.removeEventListener("touchmove", pause);
      window.removeEventListener("keydown", key);
    };
  }, [follow]);

  const busy = live && conversation.turns.some((t) => t.final === false);
  // Announce the latest finished turn, once.
  const last = announce ? [...conversation.turns].reverse().find((t) => t.final !== false) : undefined;
  const announcement = last
    ? `${last.speaker ?? labels.roles[last.role]}: ${last.text}${last.interruptedAt !== undefined ? ` (${labels.interrupted})` : ""}`
    : "";

  const element = usePart(
    "transcript",
    "div",
    { live, following, busy },
    rest as PartProps<"div", TranscriptRootState>,
    {
      ...(live && { role: "log", "aria-busy": busy }),
      children: (
        <>
          {children}
          {announce && (
            <div aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
              {announcement}
            </div>
          )}
        </>
      ),
    },
    [root as React.Ref<never>],
  );
  return <TranscriptContext.Provider value={ctx}>{element}</TranscriptContext.Provider>;
}

export interface TranscriptResumeProps extends PartProps<"button", { following: boolean }> {}

/** Brings following back after the reader scrolled away ("Jump to now"), scrolling to the current
 * turn. Hidden (the `hidden` attribute) while following. Renders a `<button>`; give it a label. */
export function TranscriptResume(props: TranscriptResumeProps): React.ReactElement {
  const { following, resume } = useTranscript("Transcript.Resume");
  return usePart("transcript-resume", "button", { following }, props, {
    type: "button",
    hidden: following,
    onClick: resume,
  });
}

export interface TranscriptTurnsProps {
  /** Renders each turn; a `Transcript.Turn` with its speaker and words by default. */
  children?: (turn: Turn) => React.ReactNode;
  /** Puts a `Transcript.Gap` before each turn that follows at least this many seconds of silence
   * (a slow reply, a hold); none by default. */
  gaps?: number;
  /** Renders each gap; a `Transcript.Gap` by default. */
  gap?: (gap: TranscriptGapValue) => React.ReactNode;
  /** Seconds the caller may wait for the agent: longer waits get `data-slow`. */
  budget?: number;
}

export interface TranscriptGapValue {
  start: number;
  end: number;
  before: Turn;
  after: Turn;
}

/** Every turn of the conversation, in order. */
export function TranscriptTurns(props: TranscriptTurnsProps): React.ReactElement {
  const { conversation } = useTranscript("Transcript.Turns");
  const render =
    props.children ??
    ((turn: Turn) => (
      <TranscriptTurn key={turn.id} turn={turn}>
        <TranscriptSpeaker /> <TranscriptWords />
      </TranscriptTurn>
    ));
  const silences = useMemo(
    () => (props.gaps === undefined ? [] : gaps(conversation, props.gaps)),
    [conversation, props.gaps],
  );
  return (
    <>
      {conversation.turns.map((turn) => {
        const g = silences.find((x) => x.after.id === turn.id);
        return (
          <Fragment key={turn.id}>
            {g && (props.gap ? props.gap(g) : <TranscriptGap gap={g} budget={props.budget} />)}
            {render(turn)}
          </Fragment>
        );
      })}
    </>
  );
}

export interface TranscriptGapState extends Record<string, unknown> {
  /** `wait`: the caller waiting for the agent to answer; `silence`: anything else. */
  kind: "wait" | "silence";
  /** A wait over the budget. */
  slow: boolean;
}

export interface TranscriptGapProps extends PartProps<"div", TranscriptGapState> {
  gap: TranscriptGapValue;
  /** Seconds the caller may wait before a wait is `data-slow`. */
  budget?: number | undefined;
}

/** A silence between turns: `--gap-duration` in seconds, and its length as text ("1.8 s") unless
 * you give children. Style a wait over your latency budget apart, or show breathing dots for a
 * hold. Renders a `<div>`. */
export function TranscriptGap(props: TranscriptGapProps): React.ReactElement {
  const { gap, budget, ...rest } = props;
  const seconds = gap.end - gap.start;
  const kind = gap.before.role === "user" && gap.after.role === "agent" ? "wait" : "silence";
  const slow = kind === "wait" && budget !== undefined && seconds > budget;
  return usePart("transcript-gap", "div", { kind, slow }, rest as PartProps<"div", TranscriptGapState>, {
    style: { "--gap-duration": seconds.toFixed(2) } as React.CSSProperties,
    children: `${seconds.toFixed(1)} s`,
  });
}

export interface TranscriptTurnState extends Record<string, unknown> {
  role: Turn["role"];
  /** Being played now. */
  active: boolean;
  /** Played already. */
  past: boolean;
  interrupted: boolean;
  /** Still streaming (live). */
  streaming: boolean;
  /** Arrived after the transcript first rendered: animate it in. */
  new: boolean;
  /** Picked in the player's selection (a click here, in the timeline, or an inspector). */
  selected: boolean;
}

export interface TranscriptTurnProps extends PartProps<"div", TranscriptTurnState> {
  turn: Turn;
}

/** One turn: `data-role`, `data-active` while it plays, `data-past` once it has, and
 * `data-interrupted` when the caller cut the agent off. Renders a `<div>`. */
export function TranscriptTurn(props: TranscriptTurnProps): React.ReactElement {
  const { turn, ...rest } = props;
  const { conversation, clock, root, following, mounted } = useTranscript("Transcript.Turn");
  const player = useContext(PlayerContext);
  const selected = useSelected(player?.selection ?? NOTHING_PICKED, "turnId", turn.id);
  const [isNew] = useState(() => mounted.current);
  const index = conversation.turns.findIndex((t) => t.id === turn.id);
  // How many turns away the one being played is: for depth-of-field styling (`--distance`).
  const activeIndex = useClockValue(
    clock ?? STOPPED,
    (c) => {
      const at = turnAt(conversation, c.time());
      return at ? conversation.turns.findIndex((t) => t.id === at.id) : -1;
    },
    -1,
  );
  const distance = activeIndex < 0 ? 0 : Math.abs(index - activeIndex);
  const where = useClockValue(
    clock ?? STOPPED,
    (c) => {
      const t = c.time();
      if (turnAt(conversation, t)?.id === turn.id) return "active";
      return t > spokenUntil(turn) ? "past" : "upcoming";
    },
    "upcoming",
  );
  const streaming = turn.final === false;
  const isLast = conversation.turns.at(-1)?.id === turn.id;
  const followed = clock ? where === "active" : streaming || isLast;
  const ref = useRef<HTMLElement>(null);
  useFollowTarget(ref, root, following && followed);

  const element = usePart(
    "transcript-turn",
    "div",
    {
      role: turn.role,
      active: where === "active",
      past: where === "past",
      interrupted: turn.interruptedAt !== undefined,
      streaming,
      new: isNew,
      selected,
    },
    rest as PartProps<"div", TranscriptTurnState>,
    { style: { "--distance": distance } as React.CSSProperties },
    [ref as React.Ref<never>],
  );
  return <TurnContext.Provider value={turn}>{element}</TurnContext.Provider>;
}

const NOTHING_PICKED = createSelection();

const STOPPED: Clock = {
  time: () => -1,
  playing: () => false,
  duration: () => 0,
  subscribe: () => () => {},
  seek() {},
  play() {},
  pause() {},
  rate: () => 1,
  setRate() {},
};

function useFollowTarget(
  ref: React.RefObject<HTMLElement | null>,
  root: React.RefObject<HTMLElement | null>,
  when: boolean,
) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = ref.current;
    const box = root.current;
    if (!when || !el || !box || box.scrollHeight <= box.clientHeight) return;
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    // Leave it while it sits in the upper-middle of the view; bring it back to a third down once
    // it drifts out, so the eye isn't dragged along line by line.
    if (a.top >= b.top + box.clientHeight * 0.1 && a.bottom <= b.bottom - box.clientHeight * 0.25) return;
    springScroll(box, box.scrollTop + (a.top - b.top) - box.clientHeight / 3, reduced);
  });
}

// One scroll animation per box: a new target takes over the running one, keeping its velocity.
const scrolling = new WeakMap<HTMLElement, { target: number }>();

/** Scrolls `box` to `top` on a critically damped spring (the playhead's), or at once under
 * reduced motion. */
function springScroll(box: HTMLElement, top: number, reduced: boolean) {
  const target = Math.max(0, Math.min(top, box.scrollHeight - box.clientHeight));
  if (reduced) {
    box.scrollTop = target;
    return;
  }
  const running = scrolling.get(box);
  if (running) {
    running.target = target;
    return;
  }
  const state = spring.create(box.scrollTop);
  const job = { target };
  scrolling.set(box, job);
  let last = 0;
  const tick = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    spring.damp(state, job.target, 0.28, dt);
    box.scrollTop = state.value;
    if (Math.abs(state.value - job.target) < 0.5 && Math.abs(state.velocity) < 5) {
      box.scrollTop = job.target;
      scrolling.delete(box);
    } else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface TranscriptSpeakerProps extends PartProps<"span", TranscriptTurnState> {}

/** The turn's speaker: its `speaker` label, else its role's ("Agent", "Caller"). Renders a
 * `<span>`. */
export function TranscriptSpeaker(props: TranscriptSpeakerProps): React.ReactElement {
  const turn = useTurn("Transcript.Speaker");
  const { labels } = useTranscript("Transcript.Speaker");
  return usePart(
    "transcript-speaker",
    "span",
    { role: turn.role },
    props as PartProps<"span", { role: string }>,
    {
      children: turn.speaker ?? labels.roles[turn.role],
    },
  );
}

export interface TranscriptTimeProps extends PartProps<"time", { role: string }> {}

/** When the turn starts, as `m:ss`. Renders a `<time>`. */
export function TranscriptTime(props: TranscriptTimeProps): React.ReactElement {
  const turn = useTurn("Transcript.Time");
  return usePart("transcript-time", "time", { role: turn.role }, props, {
    dateTime: `PT${turn.start.toFixed(1)}S`,
    children: formatTime(turn.start),
  });
}

export interface TranscriptSeekProps extends PartProps<"button", { role: string }> {}

/** Plays from the turn's start: the keyboard's way into the recording from the transcript, one
 * tab stop per turn rather than per word. Renders a `<button>` named "Play from 0:12, Agent". */
export function TranscriptSeek(props: TranscriptSeekProps): React.ReactElement {
  const turn = useTurn("Transcript.Seek");
  const { clock, labels } = useTranscript("Transcript.Seek");
  return usePart("transcript-seek", "button", { role: turn.role }, props, {
    type: "button",
    disabled: !clock,
    "aria-label": labels.playFrom(formatTime(turn.start), turn.speaker ?? labels.roles[turn.role]),
    onClick: () => {
      clock?.seek(turn.start);
      clock?.play();
    },
  });
}

export interface TranscriptPickState extends Record<string, unknown> {
  role: string;
  /** The turn is what's picked. */
  selected: boolean;
}

export interface TranscriptPickProps extends PartProps<"button", TranscriptPickState> {}

/** Picks the turn (what an inspector explains, what the timeline highlights): the keyboard's way to
 * pick one, as a pointer can by clicking it. `aria-current` while it's the pick. Put the turn's
 * head in it (speaker, time), or leave it empty and it's named "Pick the caller's turn at 0:12".
 * Needs a `Player.Root`. Renders a `<button>`. */
export function TranscriptPick(props: TranscriptPickProps): React.ReactElement {
  const turn = useTurn("Transcript.Pick");
  const { labels } = useTranscript("Transcript.Pick");
  const player = useContext(PlayerContext);
  const selection = player?.selection ?? NOTHING_PICKED;
  const selected = useSelected(selection, "turnId", turn.id);
  return usePart("transcript-pick", "button", { role: turn.role, selected }, props, {
    type: "button",
    disabled: !player,
    ...(selected && { "aria-current": "true" }),
    ...(props.children === undefined && {
      "aria-label": labels.pick(formatTime(turn.start), turn.speaker ?? labels.roles[turn.role]),
    }),
    onClick: () => selection.set({ turnId: turn.id }),
  });
}

export interface TranscriptWordsProps extends Omit<PartProps<"span", { role: string }>, "children"> {
  /** Renders each word; a `Transcript.Word` by default. */
  children?: (word: Word, index: number) => React.ReactNode;
}

/** The turn's words, each a `Transcript.Word`, with spaces between; a turn streaming text without
 * timings shows its text word by word too. Words that arrive after the first render get
 * `data-new` and `--word-stagger` (their place in the batch that arrived together, from 0), so CSS
 * can bring them in one after another. A live turn's tentative tail follows as a
 * `Transcript.Interim`. Renders a `<span>`. */
export function TranscriptWords(props: TranscriptWordsProps): React.ReactElement {
  const { children, ...rest } = props;
  const turn = useTurn("Transcript.Words");
  const { mounted } = useTranscript("Transcript.Words");
  // Words already shown before this render; those after it arrived together.
  const shown = useRef(mounted.current ? 0 : Infinity);
  const count = turn.words.length || (turn.text ? turn.text.split(/\s+/).filter(Boolean).length : 0);
  // The previous render's count, read on purpose: words past it are the batch that just arrived.
  // oxlint-disable-next-line react/refs -- a previous-value ref
  const batchStart = Math.min(shown.current, count);
  useEffect(() => {
    shown.current = count;
  }, [count]);
  const stagger = (i: number) => (i >= batchStart ? Math.min(i - batchStart, 5) : 0);
  const content =
    turn.words.length === 0
      ? turn.text
          .split(/\s+/)
          .filter(Boolean)
          .map((text, i) => (
            <span key={i}>
              {i > 0 && " "}
              <TextWord text={text} stagger={stagger(i)} />
            </span>
          ))
      : turn.words.map((word, i) => (
          <span key={i}>
            {i > 0 && " "}
            {children ? children(word, i) : <TranscriptWord index={i} stagger={stagger(i)} />}
          </span>
        ));
  return usePart("transcript-words", "span", { role: turn.role }, rest, {
    children: (
      <>
        {content}
        {turn.interim && (
          <>
            {count > 0 && " "}
            <TranscriptInterim />
          </>
        )}
      </>
    ),
  });
}

/** A word of streamed text, with no timings: new or not, never active. */
function TextWord({ text, stagger: given }: { text: string; stagger: number }) {
  const { mounted } = useTranscript("Transcript.Words");
  const [isNew] = useState(() => mounted.current);
  // Its place in the batch it arrived with, kept from mount: later batches don't reorder it.
  const [stagger] = useState(given);
  return (
    <span
      data-slot="transcript-word"
      data-status="spoken"
      data-new={isNew ? "" : undefined}
      style={{ "--word-stagger": stagger } as React.CSSProperties}
    >
      {text}
    </span>
  );
}

export interface TranscriptInterimProps extends PartProps<"span", { role: string }> {}

/** A live turn's tentative tail, still being recognised: style it lighter, it will change. Renders
 * a `<span>`, `aria-hidden` (only settled words are read). */
export function TranscriptInterim(props: TranscriptInterimProps): React.ReactElement {
  const turn = useTurn("Transcript.Interim");
  return usePart("transcript-interim", "span", { role: turn.role }, props, {
    "aria-hidden": true,
    children: turn.interim ?? "",
  });
}

export type WordStatus = "upcoming" | "active" | "spoken" | "unspoken";

export interface TranscriptWordState extends Record<string, unknown> {
  /** `upcoming`, `active` (being said: `--word-progress` runs 0..1 over it), `spoken`, or
   * `unspoken` (the agent was cut off before it). */
  status: WordStatus;
  /** Arrived after the transcript first rendered (live): animate it in. */
  new: boolean;
}

export interface TranscriptWordProps extends PartProps<"span", TranscriptWordState> {
  index: number;
  /** Its place in the batch of words that arrived together, as `--word-stagger`. */
  stagger?: number;
}

/** One word. `data-status` says where it stands against the playhead; a click seeks to it (the
 * mouse's shortcut: the keyboard uses `Transcript.Seek` and the timeline). Renders a `<span>`. */
export function TranscriptWord(props: TranscriptWordProps): React.ReactElement {
  const { index, stagger: given = 0, ...rest } = props;
  const turn = useTurn("Transcript.Word");
  const { conversation, clock, mounted } = useTranscript("Transcript.Word");
  const [isNew] = useState(() => mounted.current);
  const [stagger] = useState(given);
  const word = turn.words[index]!;
  const spoken = isSpoken(turn, word);
  const status = useClockValue<WordStatus>(
    clock ?? STOPPED,
    (c) => {
      if (!spoken) return "unspoken";
      const t = c.time();
      if (t < 0) return turn.final === false ? "active" : "spoken";
      const at = wordAt(conversation, t);
      if (at?.turn.id === turn.id && at.index === index) return "active";
      return t >= word.start ? "spoken" : "upcoming";
    },
    spoken ? "spoken" : "unspoken",
  );

  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !clock) return;
    const set = () => {
      const p = (clock.time() - word.start) / Math.max(0.01, word.end - word.start);
      el.style.setProperty("--word-progress", String(Math.min(1, Math.max(0, p))));
    };
    set();
    if (status !== "active") return;
    return clock.subscribe(set);
  }, [clock, word, status]);

  return usePart(
    "transcript-word",
    "span",
    { status, new: isNew },
    rest as PartProps<"span", TranscriptWordState>,
    {
      style: { "--word-stagger": stagger } as React.CSSProperties,
      children: word.text,
      onClick: clock && spoken ? () => clock.seek(word.start) : undefined,
    },
    [ref as React.Ref<never>],
  );
}

export interface TranscriptEventsProps {
  /** Renders each event; a `Transcript.Event` by default. */
  children?: (event: ConversationEvent) => React.ReactNode;
  /** Which events: all of the turn's by default. */
  filter?: (event: ConversationEvent) => boolean;
}

/** The events that belong to the turn (by `turnId`), or, inside no turn, the conversation's
 * events that belong to none. */
export function TranscriptEvents(props: TranscriptEventsProps): React.ReactElement {
  const { conversation } = useTranscript("Transcript.Events");
  const turn = useContext(TurnContext);
  const events = conversation.events.filter(
    (e) => (turn ? e.turnId === turn.id : e.turnId === undefined) && (!props.filter || props.filter(e)),
  );
  return (
    <>{events.map((e) => (props.children ? props.children(e) : <TranscriptEvent key={e.id} event={e} />))}</>
  );
}

export interface TranscriptEventState extends Record<string, unknown> {
  type: ConversationEvent["type"];
  /** A tool call's `status`. */
  status: string | undefined;
  /** A verdict's result. */
  pass: boolean | undefined;
}

export interface TranscriptEventProps extends PartProps<"div", TranscriptEventState> {
  event: ConversationEvent;
}

/** What an event says, in words ("Tool call: lookup_order"); pass children to show it your way.
 * Renders a `<div>` with `data-type`, and a tool call's `data-status` or a verdict's
 * `data-pass`. */
export function TranscriptEvent(props: TranscriptEventProps): React.ReactElement {
  const { event, ...rest } = props;
  const { labels } = useTranscript("Transcript.Event");
  return usePart(
    "transcript-event",
    "div",
    {
      type: event.type,
      status: event.type === "tool_call" ? (event.status ?? "ok") : undefined,
      pass: event.type === "verdict" ? event.pass : undefined,
    },
    rest as PartProps<"div", TranscriptEventState>,
    { children: describeEvent(event, labels) },
  );
}
