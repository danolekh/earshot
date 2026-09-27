"use client";
import { type AudioSource, scriptedSource } from "@danolekh/earshot/audio";
import type { Conversation, ConversationEvent, ToolCallEvent, VerdictEvent } from "@danolekh/earshot/core";
import { formatTime, turnAt } from "@danolekh/earshot/core";
import { Orb, type OrbState } from "@danolekh/earshot/orb";
import { DE_LABELS, EN_LABELS, Player, useClockValue, usePlayer } from "@danolekh/earshot/player";
import { Timeline } from "@danolekh/earshot/timeline";
import { Transcript } from "@danolekh/earshot/transcript";
import { useMemo } from "react";

/* A call review screen built from earshot's headless parts: the orb and header, a timeline with a
 * lane per speaker, markers and a skimmer, the transcript with tool calls inline, and the judges'
 * verdicts. It ships no styles: every look is CSS on the `data-slot` and `data-*` attributes
 * (see call-review.css), so the same markup wears any skin. */

export interface CallReviewProps {
  call: Conversation;
  /** The recording; without it, the call plays on a virtual clock. */
  src?: string;
  title: string;
  subtitle?: string;
  /** The orb's colours: top, middle and deep of its sky; earshot's blue by default. */
  orb?: { colors: readonly [string, string, string] };
  lang?: "en" | "de";
  /** Chooses the CSS skin: `[data-skin="…"]`. */
  skin?: string;
  /** Shows the judges' verdicts beside the transcript, when the call has any. On by default. */
  judges?: boolean;
  className?: string;
}

export function CallReview({
  call,
  src,
  title,
  subtitle,
  orb,
  lang = "en",
  skin,
  judges = true,
  className,
}: CallReviewProps) {
  const labels = lang === "de" ? DE_LABELS : EN_LABELS;
  const verdicts = judges ? call.events.filter((e): e is VerdictEvent => e.type === "verdict") : [];
  return (
    <Player.Root conversation={call} src={src} labels={labels} data-skin={skin} className={className}>
      <header data-call="head">
        <CallOrb orb={orb} />
        <div data-call="title">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div data-call="controls">
          <Player.Toggle data-call="play">
            <PlayIcon />
          </Player.Toggle>
          <span data-call="clock">
            <Player.Time /> <span aria-hidden>/</span> <Player.Time show="duration" />
          </span>
          <Player.Rate data-call="rate" />
        </div>
      </header>

      <Timeline.Root data-call="timeline">
        <div data-call="lane-labels" aria-hidden>
          <span data-speaker="agent">{labels.roles.agent}</span>
          <span data-speaker="user">{labels.roles.user}</span>
        </div>
        <Timeline.Scrubber data-call="scrubber">
          <Timeline.Markers filter={(e) => e.type !== "latency" || e.kind === "e2e"} budget={1.2} />
          <Timeline.Lane speaker="agent">
            <Timeline.Segments />
            <Timeline.Waveform speaker="agent" />
          </Timeline.Lane>
          <Timeline.Lane speaker="user">
            <Timeline.Segments />
            <Timeline.Waveform speaker="user" />
          </Timeline.Lane>
          <Timeline.Overlaps />
          <Timeline.Skimmer>
            {(s) => (
              <span data-call="skim">
                <b>{formatTime(s.time)}</b>
                {s.turn && ` ${s.turn.speaker ?? labels.roles[s.turn.role]}: ${s.turn.text.slice(0, 64)}…`}
              </span>
            )}
          </Timeline.Skimmer>
          <Timeline.Playhead />
        </Timeline.Scrubber>
      </Timeline.Root>

      <div data-call="body">
        <Transcript.Root data-call="transcript">
          <Transcript.Turns gaps={0.7} budget={1.2}>
            {(turn) => (
              <Transcript.Turn key={turn.id} turn={turn}>
                <div data-call="turn-head">
                  <Transcript.Speaker />
                  <Transcript.Time />
                  <Transcript.Seek data-call="seek">
                    <PlayIcon />
                  </Transcript.Seek>
                </div>
                <Transcript.Events filter={(e) => e.type === "tool_call" || e.type === "intent"}>
                  {(e) => <EventChip key={e.id} event={e} />}
                </Transcript.Events>
                <p data-call="words">
                  <Transcript.Words />
                </p>
              </Transcript.Turn>
            )}
          </Transcript.Turns>
          <Transcript.Resume data-call="resume">
            {lang === "de" ? "Zur Stelle" : "Jump to now"}
          </Transcript.Resume>
        </Transcript.Root>

        {verdicts.length > 0 && (
          <aside data-call="verdicts">
            <h3>{lang === "de" ? "Bewertung" : "Judges"}</h3>
            <ul>
              {verdicts.map((v) => (
                <li key={v.id} data-pass={v.pass || undefined}>
                  <span data-call="verdict-mark" aria-hidden>
                    {v.pass ? "✓" : "✕"}
                  </span>
                  <strong>{v.judge}</strong>
                  {v.score !== undefined && <span data-call="score">{Math.round(v.score * 100)}</span>}
                  {v.reason && <p>{v.reason}</p>}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </Player.Root>
  );
}

/** The agent's orb, following the recording: speaking while the agent talks, listening while the
 * caller does, thinking in the wait between. Its loudness comes from the word timings, so it
 * moves in step with the audio and needs no Web Audio (or CORS) at all. */
function CallOrb({ orb }: { orb: CallReviewProps["orb"] }) {
  const { conversation, clock } = usePlayer("CallOrb");
  const state = useClockValue<OrbState>(
    clock,
    (c) => {
      if (!c.playing() && c.time() === 0) return "idle";
      const t = c.time();
      const turn = turnAt(conversation, t);
      if (turn) return turn.role === "agent" ? "speaking" : "listening";
      const prev = [...conversation.turns].reverse().find((x) => x.end <= t);
      const next = conversation.turns.find((x) => x.start > t);
      return prev?.role === "user" && next?.role === "agent" ? "thinking" : "idle";
    },
    "idle",
  );
  const sources = useMemo(
    (): { input: AudioSource; output: AudioSource } => ({
      input: scriptedSource(conversation, clock, "user"),
      output: scriptedSource(conversation, clock, "agent"),
    }),
    [conversation, clock],
  );
  const params = useMemo(() => (orb ? { colors: orb.colors } : undefined), [orb]);
  return (
    <Orb.Root state={state} input={sources.input} output={sources.output} data-call="orb">
      <Orb.Shader params={params} />
    </Orb.Root>
  );
}

function EventChip({ event }: { event: ConversationEvent }) {
  if (event.type === "tool_call") {
    const t = event as ToolCallEvent;
    const ms = t.end !== undefined ? Math.round((t.end - t.at) * 1000) : undefined;
    return (
      <Transcript.Event event={event} data-call="chip">
        <span data-call="chip-mark" aria-hidden>
          ✱
        </span>
        <code>{t.name}</code>
        {ms !== undefined && <span data-call="chip-ms">{ms} ms</span>}
      </Transcript.Event>
    );
  }
  if (event.type === "intent")
    return (
      <Transcript.Event event={event} data-call="chip">
        <span data-call="chip-mark" aria-hidden>
          ◆
        </span>
        <code>{event.label}</code>
      </Transcript.Event>
    );
  return <Transcript.Event event={event} data-call="chip" />;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden data-call="icon">
      <path data-icon="play" d="M4 2.5v11l9-5.5z" fill="currentColor" />
      <path data-icon="pause" d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}
