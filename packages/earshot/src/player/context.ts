"use client";
import type * as React from "react";
import { createContext, useContext, useSyncExternalStore } from "react";

import type { ListeningStore } from "../audio/listen";
import type { Clock } from "../core/clock";
import type { LiveConversation } from "../core/live";
import type { Conversation, ConversationEvent, Role } from "../core/types";
import type { Selection, SelectionStore } from "./selection";

export interface PlayerContextValue {
  conversation: Conversation;
  clock: Clock;
  /** The labels the parts announce, in the player's language. */
  labels: PlayerLabels;
  /** What's picked (a turn, a span, a finding), shared by every part in the player. */
  selection: SelectionStore;
  /** The recording's `<audio>` element once it's mounted (null without `src`), for Web Audio:
   * `mixChannels` from earshot/audio to solo a side, `fromMediaElement` for the orb. */
  media(): HTMLMediaElement | null;
  /** Which side is heard (mute and solo), when the recording's channels are known. */
  listening: ListeningStore;
  /** The recording's channels, in file order (`channels` on `Player.Root`); none when not given. */
  channels: readonly (Role | null)[];
}

export interface PlayerLabels {
  play: string;
  pause: string;
  /** The scrubber's name. */
  position: string;
  /** "{time} of {duration}", as the scrubber announces it. */
  positionText: (time: string, duration: string) => string;
  /** A turn's play-from button: "Play from 0:12, Agent". */
  playFrom: (time: string, who: string) => string;
  /** A turn's pick button, when it has no text of its own: "Pick the caller's turn at 0:12". */
  pick: (time: string, who: string) => string;
  /** Mute and solo a side: "Mute the caller", "Solo the agent". */
  mute: (who: string) => string;
  solo: (who: string) => string;
  roles: { user: string; agent: string; system: string };
  events: {
    tool_call: (name: string) => string;
    intent: (label: string) => string;
    latency: (kind: string, ms: number) => string;
    verdict: (judge: string, pass: boolean) => string;
    handoff: (to: string) => string;
    note: (label: string) => string;
  };
  /** The live region's line for an interrupted agent turn. */
  interrupted: string;
  /** The orb's states, announced as they change. */
  states: { idle: string; listening: string; thinking: string; speaking: string };
}

export const EN_LABELS: PlayerLabels = {
  play: "Play",
  pause: "Pause",
  position: "Position in the call",
  positionText: (time, duration) => `${time} of ${duration}`,
  playFrom: (time, who) => `Play from ${time}, ${who}`,
  pick: (time, who) => `Pick the ${who.toLowerCase()}'s turn at ${time}`,
  mute: (who) => `Mute the ${who.toLowerCase()}`,
  solo: (who) => `Solo the ${who.toLowerCase()}`,
  roles: { user: "Caller", agent: "Agent", system: "System" },
  events: {
    tool_call: (name) => `Tool call: ${name}`,
    intent: (label) => `Intent: ${label}`,
    latency: (kind, ms) => `${kind === "e2e" ? "Response time" : kind.toUpperCase()}: ${ms} ms`,
    verdict: (judge, pass) => `${judge}: ${pass ? "passed" : "failed"}`,
    handoff: (to) => `Handed off to ${to}`,
    note: (label) => label,
  },
  interrupted: "interrupted",
  states: { idle: "Idle", listening: "Listening", thinking: "Thinking", speaking: "Speaking" },
};

export const DE_LABELS: PlayerLabels = {
  play: "Abspielen",
  pause: "Pause",
  position: "Position im Gespräch",
  positionText: (time, duration) => `${time} von ${duration}`,
  playFrom: (time, who) => `Ab ${time} abspielen, ${who}`,
  pick: (time, who) => `${who} bei ${time} auswählen`,
  mute: (who) => `${who} stummschalten`,
  solo: (who) => `Nur ${who} hören`,
  roles: { user: "Anrufer", agent: "Assistent", system: "System" },
  events: {
    tool_call: (name) => `Tool-Aufruf: ${name}`,
    intent: (label) => `Anliegen: ${label}`,
    latency: (kind, ms) => `${kind === "e2e" ? "Antwortzeit" : kind.toUpperCase()}: ${ms} ms`,
    verdict: (judge, pass) => `${judge}: ${pass ? "bestanden" : "nicht bestanden"}`,
    handoff: (to) => `Übergeben an ${to}`,
    note: (label) => label,
  },
  interrupted: "unterbrochen",
  states: { idle: "Bereit", listening: "Hört zu", thinking: "Denkt nach", speaking: "Spricht" },
};

export const PlayerContext: React.Context<PlayerContextValue | null> =
  createContext<PlayerContextValue | null>(null);

/** The player around this part; throws outside one, naming the part that needs it. */
export function usePlayer(part: string): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <Player.Root>.`);
  return ctx;
}

/** A value read from the clock, re-rendering only when it changes. Keep the selector coarse (a
 * turn id, a boolean): anything that changes every frame belongs in a CSS variable instead. */
export function useClockValue<T>(clock: Clock, select: (clock: Clock) => T, server: T): T {
  return useSyncExternalStore(
    clock.subscribe,
    () => select(clock),
    () => server,
  );
}

/** The snapshot of a live conversation, or the conversation as given. */
export function useConversationValue(conversation: Conversation | LiveConversation): Conversation {
  const live = "subscribe" in conversation ? conversation : null;
  const value = useSyncExternalStore(
    live ? live.subscribe : noopSubscribe,
    live ? live.get : () => conversation as Conversation,
    live ? live.get : () => conversation as Conversation,
  );
  return value;
}

const noopSubscribe = () => () => {};

/** Whether the turn, span or finding with `id` is the picked one; re-renders only when that
 * changes. */
export function useSelected(
  selection: SelectionStore,
  kind: keyof Selection,
  id: string | undefined,
): boolean {
  return useSyncExternalStore(
    selection.subscribe,
    () => id !== undefined && selection.get()[kind] === id,
    () => false,
  );
}

/** An event in words, in the labels' language. */
export function describeEvent(e: ConversationEvent, labels: PlayerLabels): string {
  switch (e.type) {
    case "tool_call":
      return labels.events.tool_call(e.name);
    case "intent":
      return labels.events.intent(e.label);
    case "latency":
      return labels.events.latency(e.kind, Math.round((e.end - e.at) * 1000));
    case "verdict":
      return labels.events.verdict(e.judge, e.pass);
    case "handoff":
      return labels.events.handoff(e.to);
    case "note":
      return labels.events.note(e.label);
  }
}
