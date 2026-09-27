"use client";
import type * as React from "react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { audible, createListening, gainsFor, toggleMute, toggleSolo } from "../audio/listen";
import { type ChannelMix, mixChannels } from "../audio/mix";
import { type Clock, createVirtualClock } from "../core/clock";
import { formatTime } from "../core/conversation";
import type { LiveConversation } from "../core/live";
import type { Conversation, Role } from "../core/types";
import { type PartProps, usePart } from "../utils/part";
import { useIsoLayoutEffect } from "../utils/use-iso-layout-effect";
import {
  EN_LABELS,
  PlayerContext,
  type PlayerContextValue,
  type PlayerLabels,
  useClockValue,
  useConversationValue,
  usePlayer,
} from "./context";
import { createMediaClock } from "./media-clock";
import { createSelection, type SelectionStore } from "./selection";

/** A clock that forwards to whichever clock backs it now: virtual until the audio element mounts,
 * then the element's. Parts subscribe once and never notice the switch. */
function createRelayClock(initial: Clock): Clock & { use(next: Clock): void } {
  let inner = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  let off = inner.subscribe(emit);
  return {
    time: () => inner.time(),
    playing: () => inner.playing(),
    duration: () => inner.duration(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    seek: (t) => inner.seek(t),
    play: () => inner.play(),
    pause: () => inner.pause(),
    rate: () => inner.rate(),
    setRate: (r) => inner.setRate(r),
    use(next) {
      if (next === inner) return;
      off();
      inner = next;
      off = inner.subscribe(emit);
      emit();
    },
  };
}

const NO_CHANNELS: readonly (Role | null)[] = [];

export interface PlayerState extends Record<string, unknown> {
  playing: boolean;
}

export interface PlayerRootProps extends PartProps<"div", PlayerState> {
  /** The call: a finished conversation, or a live one as it streams. */
  conversation: Conversation | LiveConversation;
  /** The recording, or several formats of it, best first (Ogg Opus, then MP3 for browsers without
   * it). Without one, time runs on a virtual clock over the conversation's length. */
  src?: string | readonly { src: string; type: string }[];
  /** For audio on another origin that Web Audio will read (channel solo, visualizers). */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Your own clock, to drive the parts from something else (a video, a recorder). */
  clock?: Clock;
  /** Starts again at the end. */
  loop?: boolean;
  labels?: PlayerLabels;
  /** What's picked, when you want to read or set it from outside (an inspector, the URL); the
   * player keeps its own otherwise. */
  selection?: SelectionStore;
  /** Whose voice each channel of the recording carries, in file order (`["user", "agent"]` for a
   * stereo call, caller left): makes `Player.Mute` and `Player.Solo` work. Leave it out for a mono
   * recording. */
  channels?: readonly (Role | null)[];
}

/** Holds a conversation and where playback is in it, for every part inside: the transcript
 * highlights along, the timeline's playhead moves, the orb and visualizers can follow the
 * recording. Renders a `<div>`, and a hidden `<audio>` when given `src`. */
export function PlayerRoot(props: PlayerRootProps): React.ReactElement {
  const {
    conversation,
    src,
    clock: given,
    loop = false,
    labels = EN_LABELS,
    selection: pickedFrom,
    crossOrigin,
    channels = NO_CHANNELS,
    children,
    ...rest
  } = props;
  const [listening] = useState(createListening);
  const [ownSelection] = useState(() => createSelection());
  const selection = pickedFrom ?? ownSelection;
  const value = useConversationValue(conversation);
  const durationRef = useRef(value.duration);
  const [virtual] = useState(() => createVirtualClock(value.duration, { loop }));
  useIsoLayoutEffect(() => {
    durationRef.current = value.duration;
    virtual.setDuration(value.duration);
    virtual.setLoop(loop);
  }, [virtual, value.duration, loop]);
  const [relay] = useState(() => createRelayClock(given ?? virtual));
  const audio = useRef<HTMLAudioElement>(null);
  const sourceKey = typeof src === "string" ? src : (src ?? []).map((s) => s.src).join("|");
  const hasSource = sourceKey !== "";

  useIsoLayoutEffect(() => {
    if (given) return relay.use(given);
    const element = audio.current;
    if (!hasSource || !element) return relay.use(virtual);
    const media = createMediaClock(element, () => durationRef.current);
    relay.use(media);
    return () => {
      media.dispose();
      relay.use(virtual);
    };
  }, [given, sourceKey, virtual, relay]);

  // Muting or soloing routes the recording through Web Audio, built on the first change: inside the
  // click that made it, as browsers ask before audio can start.
  const channelKey = channels.join();
  useIsoLayoutEffect(() => {
    let mix: ChannelMix | undefined;
    const apply = () => {
      const element = audio.current;
      if (!element || !channels.length) return;
      mix ??= mixChannels(element);
      mix.set(gainsFor(listening.get(), channels));
    };
    if (mix === undefined && (listening.get().muted.length || listening.get().soloed.length)) apply();
    const off = listening.subscribe(apply);
    return () => {
      off();
      mix?.dispose();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the channels by value
  }, [listening, channelKey, sourceKey]);

  const ctx = useMemo<PlayerContextValue>(
    () => ({
      conversation: value,
      clock: relay,
      labels,
      selection,
      media: () => audio.current,
      listening,
      channels,
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the channels by value
    [value, relay, labels, selection, listening, channelKey],
  );
  const playing = useClockValue(relay, (c) => c.playing(), false);
  const element = usePart("player", "div", { playing }, rest as PartProps<"div", PlayerState>, {
    children: (
      <>
        {/* The transcript is the recording's text alternative, so the audio carries no captions. */}
        {typeof src === "string" ? (
          // oxlint-disable-next-line jsx-a11y/media-has-caption
          <audio ref={audio} src={src} preload="metadata" loop={loop} crossOrigin={crossOrigin} hidden />
        ) : src?.length ? (
          // oxlint-disable-next-line jsx-a11y/media-has-caption
          <audio ref={audio} preload="metadata" loop={loop} crossOrigin={crossOrigin} hidden>
            {src.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </audio>
        ) : null}
        {children}
      </>
    ),
  });
  return <PlayerContext.Provider value={ctx}>{element}</PlayerContext.Provider>;
}

export interface PlayerToggleProps extends PartProps<"button", PlayerState> {}

/** Plays and pauses. Renders a `<button>` named "Play" or "Pause" as it stands. */
export function PlayerToggle(props: PlayerToggleProps): React.ReactElement {
  const { clock, labels } = usePlayer("Player.Toggle");
  const playing = useClockValue(clock, (c) => c.playing(), false);
  return usePart("player-toggle", "button", { playing }, props as PartProps<"button", PlayerState>, {
    type: "button",
    "aria-label": playing ? labels.pause : labels.play,
    onClick: () => (clock.playing() ? clock.pause() : clock.play()),
  });
}

export interface PlayerTimeProps extends PartProps<"span", PlayerTimeState> {
  /** `"current"` (the default), `"duration"`, or `"remaining"` (with a minus sign). */
  show?: "current" | "duration" | "remaining";
}

export interface PlayerTimeState extends Record<string, unknown> {
  show: "current" | "duration" | "remaining";
}

/** The time as `m:ss`, updated once a second. Renders a `<span>`. */
export function PlayerTime(props: PlayerTimeProps): React.ReactElement {
  const { show = "current", ...rest } = props;
  const { clock } = usePlayer("Player.Time");
  const seconds = useClockValue(
    clock,
    (c) =>
      Math.floor(
        show === "current" ? c.time() : show === "duration" ? c.duration() : c.duration() - c.time(),
      ),
    0,
  );
  const text = (show === "remaining" ? "-" : "") + formatTime(seconds);
  return usePart("player-time", "span", { show }, rest as PartProps<"span", PlayerTimeState>, {
    children: text,
  });
}

export interface PlayerRateProps extends PartProps<"button", PlayerRateState> {
  /** The speeds it cycles through; 1, 1.5 and 2 by default. */
  rates?: readonly number[];
}

export interface PlayerRateState extends Record<string, unknown> {
  rate: number;
}

/** Cycles the playback speed. Renders a `<button>` showing it ("1.5×"). */
export function PlayerRate(props: PlayerRateProps): React.ReactElement {
  const { rates = [1, 1.5, 2], ...rest } = props;
  const { clock } = usePlayer("Player.Rate");
  const rate = useClockValue(clock, (c) => c.rate(), 1);
  return usePart("player-rate", "button", { rate }, rest as PartProps<"button", PlayerRateState>, {
    type: "button",
    children: `${rate}×`,
    onClick: () => clock.setRate(rates[(rates.indexOf(clock.rate()) + 1) % rates.length] ?? 1),
  });
}

export interface PlayerListenState extends Record<string, unknown> {
  speaker: Role;
  /** Muted (for `Player.Mute`) or soloed (for `Player.Solo`). */
  pressed: boolean;
}

export interface PlayerListenProps extends PartProps<"button", PlayerListenState> {
  /** The side it mutes or solos. */
  speaker: Role;
}

/** Whether a side is muted, soloed, and heard, re-rendering only when that changes. */
export function useListening(speaker: Role): { muted: boolean; soloed: boolean; heard: boolean } {
  const { listening, channels } = usePlayer("useListening");
  const key = useSyncExternalStore(
    listening.subscribe,
    () => {
      const l = listening.get();
      return `${l.muted.includes(speaker)}|${l.soloed.includes(speaker)}|${audible(l, speaker)}`;
    },
    () => "false|false|true",
  );
  const [muted, soloed, heard] = key.split("|").map((v) => v === "true") as [boolean, boolean, boolean];
  return { muted, soloed, heard: heard || !channels.includes(speaker) };
}

function useListenButton(
  slot: string,
  props: PlayerListenProps,
  pressedOf: (s: { muted: boolean; soloed: boolean }) => boolean,
  toggle: typeof toggleMute,
  label: (who: string) => string,
): React.ReactElement {
  const { speaker, ...rest } = props;
  const { listening, channels, labels } = usePlayer(slot === "player-mute" ? "Player.Mute" : "Player.Solo");
  const state = useListening(speaker);
  const pressed = pressedOf(state);
  return usePart(slot, "button", { speaker, pressed }, rest as PartProps<"button", PlayerListenState>, {
    type: "button",
    "aria-pressed": pressed,
    "aria-label": label(labels.roles[speaker]),
    disabled: !channels.includes(speaker),
    onClick: () => listening.set(toggle(listening.get(), speaker)),
  });
}

/** Mutes a side of the recording, or hears it again: a `<button aria-pressed>`, disabled when the
 * player has no channel for that side (`channels` on `Player.Root`). Renders a `<button>`. */
export function PlayerMute(props: PlayerListenProps): React.ReactElement {
  const { labels } = usePlayer("Player.Mute");
  return useListenButton("player-mute", props, (s) => s.muted, toggleMute, labels.mute);
}

/** Hears only this side (in both ears), with any other soloed side: a `<button aria-pressed>`.
 * Solo wins over mute. Renders a `<button>`. */
export function PlayerSolo(props: PlayerListenProps): React.ReactElement {
  const { labels } = usePlayer("Player.Solo");
  return useListenButton("player-solo", props, (s) => s.soloed, toggleSolo, labels.solo);
}
