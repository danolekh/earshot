/* The call in lanes, on one clock, from one registry: the gutter's labels and the lanes are the
 * same list, so they can't drift apart, and a view setting that hides lanes (by speaker, or all the
 * word lanes) is a filter over it. The lanes are presentational; the scrubber over them is the
 * accessible control. */
import { formatTime } from "@danolekh/earshot/core";
import { Player } from "@danolekh/earshot/player";
import { findingAt } from "@danolekh/earshot/review";
import { type KeyAction, laneRows, laneStyle, Timeline, type Viewport } from "@danolekh/earshot/timeline";
import type { Channel, Finding, TraceSignal } from "@danolekh/earshot/trace";
import { findingLabel, measuredSpeech, TURN_TAKING_SIGNALS } from "@danolekh/earshot/trace";
import {
  ArrowLeftRight,
  AudioWaveform,
  ChartGantt,
  Ear,
  Eye,
  EyeOff,
  Flag,
  type LucideIcon,
  MessageSquareText,
  Quote,
  Tag,
} from "lucide-react";
import type * as React from "react";
import { useMemo } from "react";

import { findingMarks } from "@/lib/keys";
import type { Prepared } from "@/lib/prepare";

import { FindingIcon } from "./finding-icon";

export type LaneId =
  | "findings"
  | "call"
  | "caller"
  | "heard"
  | "said"
  | "turns"
  | "agent"
  | "agent-words"
  | "spans"
  | "context";

/** What a lane draws from: worked out once per call. */
export interface LaneData {
  prepared: Prepared;
  turnTaking: readonly TraceSignal[];
}

export interface LaneDef {
  id: LaneId;
  label: string;
  /** Whose it is: the whole call, one side, or the pipeline. */
  group: "call" | "caller" | "agent" | "pipeline";
  /** What it shows, so "hide every word lane" is one filter. */
  kind: "markers" | "audio" | "words" | "events";
  /** CSS height: the least it gets, and what it grows from. */
  height: string;
  /** Its share of the room the timeline has beyond every lane's height (0: stays at its height). */
  grow: number;
  /** CSS: the most it grows to. */
  max?: string;
  icon: LucideIcon;
  /** The speaker `Timeline.Lane` filters segments by. */
  speaker?: "user" | "agent";
  /** An audio lane's side of the recording, which can be muted or soloed. */
  side?: Channel;
  /** Whether a call has anything for it (a mono call has no side of its own to draw). */
  available?(prepared: Prepared): boolean;
  render(data: LaneData): React.ReactNode;
}

const stereo = (p: Prepared) => !p.pyramids.mixed;

export const LANES: readonly LaneDef[] = [
  {
    id: "findings",
    label: "Findings",
    group: "call",
    kind: "markers",
    height: "var(--h-findings)",
    grow: 0,
    icon: Flag,
    render: ({ prepared }) => (
      <Timeline.Findings findings={prepared.trace.findings}>
        {(c) =>
          c.items.length === 1 ? (
            <Timeline.Finding key={c.items[0]!.id} finding={c.items[0]!}>
              <FindingIcon type={c.items[0]!.type} severity={c.items[0]!.severity} className="marker" />
            </Timeline.Finding>
          ) : (
            <Timeline.FindingCluster key={c.items.map((f) => f.id).join("+")} cluster={c} />
          )
        }
      </Timeline.Findings>
    ),
  },
  {
    // A mono recording (ElevenLabs Agents): both sides on one waveform, each turn marked.
    id: "call",
    label: "Call audio",
    group: "call",
    kind: "audio",
    height: "var(--h-audio)",
    grow: 4,
    max: "calc(var(--max-audio) * 1.5)",
    icon: AudioWaveform,
    available: (p) => !!p.pyramids.mixed,
    render: ({ prepared }) => (
      <>
        <Timeline.Segments />
        {prepared.pyramids.mixed && (
          <Timeline.Waveform peaks={prepared.pyramids.mixed} shape="minmax" className="wave" />
        )}
      </>
    ),
  },
  {
    id: "caller",
    label: "Caller",
    group: "caller",
    kind: "audio",
    height: "var(--h-audio)",
    grow: 3,
    max: "var(--max-audio)",
    icon: AudioWaveform,
    speaker: "user",
    side: "caller",
    available: stereo,
    render: ({ prepared }) => (
      <>
        <Timeline.Segments />
        {prepared.pyramids.caller && (
          <Timeline.Waveform
            speaker="user"
            peaks={prepared.pyramids.caller}
            shape="minmax"
            className="wave"
          />
        )}
      </>
    ),
  },
  {
    id: "heard",
    label: "Agent heard",
    group: "caller",
    kind: "words",
    height: "var(--h-words)",
    grow: 0.4,
    max: "var(--max-words)",
    icon: Ear,
    render: ({ prepared }) => <Timeline.Words words={prepared.words.heard} compare={prepared.words.said} />,
  },
  {
    id: "said",
    label: "Was said",
    group: "caller",
    kind: "words",
    height: "var(--h-words)",
    grow: 0.4,
    max: "var(--max-words)",
    icon: Quote,
    render: ({ prepared }) => <Timeline.Words words={prepared.words.said} compare={prepared.words.heard} />,
  },
  {
    id: "turns",
    label: "Turn-taking",
    group: "pipeline",
    kind: "events",
    height: "var(--h-turns)",
    grow: 0.6,
    max: "var(--max-turns)",
    icon: ArrowLeftRight,
    render: ({ prepared, turnTaking }) => (
      <>
        {(measuredSpeech(prepared.trace, "caller") ?? []).map((s) => (
          <Timeline.Item
            key={`c${s.start}`}
            start={s.start}
            end={s.end}
            row={0}
            data-channel="caller"
            className="vad"
          />
        ))}
        {(measuredSpeech(prepared.trace, "agent") ?? []).map((s) => (
          <Timeline.Item
            key={`a${s.start}`}
            start={s.start}
            end={s.end}
            row={1}
            data-channel="agent"
            className="vad"
          />
        ))}
        <Timeline.Signals signals={turnTaking} />
      </>
    ),
  },
  {
    id: "agent",
    label: "Agent",
    group: "agent",
    kind: "audio",
    height: "var(--h-audio)",
    grow: 3,
    max: "var(--max-audio)",
    icon: AudioWaveform,
    speaker: "agent",
    side: "agent",
    available: stereo,
    render: ({ prepared }) => (
      <>
        <Timeline.Segments />
        {prepared.pyramids.agent && (
          <Timeline.Waveform
            speaker="agent"
            peaks={prepared.pyramids.agent}
            shape="minmax"
            className="wave"
          />
        )}
      </>
    ),
  },
  {
    id: "agent-words",
    label: "Agent said",
    group: "agent",
    kind: "words",
    height: "var(--h-words)",
    grow: 0.4,
    max: "var(--max-words)",
    icon: MessageSquareText,
    render: ({ prepared }) => <Timeline.Words words={prepared.words.agent} />,
  },
  {
    id: "spans",
    label: "Pipeline",
    group: "pipeline",
    kind: "events",
    height: "var(--h-spans)",
    grow: 2,
    max: "var(--max-spans)",
    icon: ChartGantt,
    render: ({ prepared }) => <Timeline.Spans spans={prepared.trace.spans} />,
  },
  {
    id: "context",
    label: "Ran on",
    group: "pipeline",
    kind: "events",
    height: "var(--h-context)",
    grow: 0,
    icon: Tag,
    render: ({ prepared }) =>
      prepared.trace.turns
        .filter((t) => t.channel === "agent")
        .map((t) => (
          <Timeline.Item key={t.id} start={t.start} end={t.end} className="context">
            {t.context?.promptVersion} · {t.context?.model}
          </Timeline.Item>
        )),
  },
];

/** A lane's name out of context (menus, notices), where "Caller" alone would read as the whole
 * side. */
export const laneName = (lane: LaneDef): string => (lane.side ? `${lane.label} audio` : lane.label);

/** What the timeline draws, top to bottom: the lanes shown, and a strip where hidden ones were. */
type Row = { kind: "lane"; lane: LaneDef } | { kind: "strip"; ids: LaneId[]; names: string[] };

/** The height of a hidden lane's strip, in the gutter and the timeline alike. */
const STRIP = "6px";

/** A lane's box, the same in the gutter and the timeline: at least its height, growing by its share
 * of the room left. Both columns are flex columns of the same height, so a label and its lane come
 * out the same size without measuring anything. */
const laneBox = (lane: LaneDef): React.CSSProperties => laneStyle(lane);

export function Lanes({
  prepared,
  viewport,
  follow,
  lanes = LANES,
  all = LANES,
  density = "comfortable",
  onShowAll,
  onHide,
  hidden,
  onShow,
  onKeyAction,
}: {
  prepared: Prepared;
  viewport: Viewport;
  follow: boolean;
  lanes?: readonly LaneDef[];
  /** Every lane this call has (hidden ones get a strip). */
  all?: readonly LaneDef[];
  density?: "compact" | "comfortable" | "expanded";
  /** Offered when every lane is hidden. */
  onShowAll?: () => void;
  /** Hides a lane from its gutter label; not offered on the last one shown. */
  onHide?: (id: LaneId) => void;
  /** The lanes hidden, each run of them drawn as a strip where they were... */
  hidden?: readonly LaneId[];
  /** ...that shows them again. */
  onShow?: (ids: LaneId[]) => void;
  /** What the scrubber's keys do, when the page handles them (a hop to a finding picks it). */
  onKeyAction?: (action: Exclude<KeyAction, null>) => void;
}) {
  const { trace } = prepared;
  const data = useMemo<LaneData>(
    () => ({ prepared, turnTaking: trace.signals.filter((s) => TURN_TAKING_SIGNALS.has(s.type)) }),
    [prepared, trace],
  );
  const rows = useMemo((): Row[] => {
    if (!onShow || !hidden?.length) return lanes.map((lane) => ({ kind: "lane", lane }));
    const byId = new Map(all.map((l) => [l.id, l]));
    return laneRows(
      all.map((l) => l.id),
      hidden,
    ).map((r) =>
      "lane" in r
        ? { kind: "lane", lane: byId.get(r.lane)! }
        : { kind: "strip", ids: r.strip, names: r.strip.map((id) => laneName(byId.get(id)!)) },
    );
  }, [lanes, all, hidden, onShow]);
  // `[` `]` on the scrubber land where the debugger's keys do: a lead-in before each finding.
  const { marks, failures } = useMemo(() => findingMarks(trace.findings), [trace]);
  const findingNear = (t: number): Finding | undefined => findingAt(trace.findings, t);
  return (
    <>
      {/* At least the panel's height: the lanes grow into it, and past it the panel scrolls. */}
      <div
        className="grid min-h-full grid-cols-[var(--gutter)_minmax(0,1fr)] grid-rows-[minmax(min-content,1fr)]"
        data-density={density}
      >
        <ul
          aria-label="Lanes"
          className="gutter text-muted-foreground m-0 flex list-none flex-col py-0 pr-2 pl-3 text-right text-[11px]"
        >
          <li aria-hidden className="flex-none" style={{ height: "var(--h-ruler)" }} />
          {rows.map((row) =>
            row.kind === "strip" ? (
              <li key={`strip:${row.ids.join(",")}`} className="relative flex-none" style={{ height: STRIP }}>
                <RestoreStrip names={row.names} onShow={() => onShow?.(row.ids)} />
              </li>
            ) : (
              <li
                key={row.lane.id}
                data-lane={row.lane.id}
                data-group={row.lane.group}
                className="group/lane relative flex flex-col items-end justify-center gap-0.5"
                style={laneBox(row.lane)}
              >
                {onHide && lanes.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hide the ${laneName(row.lane)} lane`}
                    title={`Hide the ${laneName(row.lane)} lane`}
                    className="hover:bg-muted hover:text-foreground focus-visible:ring-ring absolute top-1/2 left-0.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => onHide(row.lane.id)}
                  >
                    <EyeOff className="size-3" aria-hidden />
                  </button>
                )}
                <span className="truncate">{row.lane.label}</span>
                {row.lane.speaker && row.lane.side && <SideControls speaker={row.lane.speaker} />}
              </li>
            ),
          )}
        </ul>
        <Timeline.Root viewport={viewport} follow={follow} className="timeline flex flex-col">
          <Timeline.Ruler className="ruler flex-none" />
          <Timeline.Scrubber
            zoom
            marks={marks}
            failures={failures}
            {...(onKeyAction && { onKeyAction })}
            className="scrubber flex min-h-0 flex-1 flex-col"
            valueText={(t, text) => {
              const f = findingNear(t);
              return f ? `${text}. ${findingLabel(f.type)}: ${f.message}` : text;
            }}
          >
            {rows.map((row) => {
              if (row.kind === "strip")
                return (
                  <div
                    key={`strip:${row.ids.join(",")}`}
                    aria-hidden
                    className="lane-strip flex-none"
                    style={{ height: STRIP }}
                  />
                );
              const { lane } = row;
              return (
                <Timeline.Lane
                  key={lane.id}
                  {...(lane.speaker && { speaker: lane.speaker })}
                  size={lane}
                  data-lane={lane.id}
                  data-group={lane.group}
                  className="lane"
                >
                  {lane.render(data)}
                </Timeline.Lane>
              );
            })}
            <Timeline.Overlaps />
            <Timeline.Skimmer className="skimmer">
              {(info) => {
                const f = findingNear(info.time);
                return (
                  <span className="skim-label">
                    {formatTime(info.time)}
                    {info.turn ? ` · ${info.turn.text.slice(0, 48)}` : ""}
                    {f ? ` · ${findingLabel(f.type)}` : ""}
                  </span>
                );
              }}
            </Timeline.Skimmer>
            <Timeline.Playhead className="playhead" />
          </Timeline.Scrubber>
        </Timeline.Root>
      </div>
      {/* Outside the scrubber, which takes the pointer for seeking. */}
      {lanes.length === 0 && (
        <div className="text-muted-foreground flex h-16 items-center justify-center gap-2 pl-(--gutter) text-sm">
          Every lane is hidden.
          {onShowAll && (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={onShowAll}
            >
              Show all lanes
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** A mixer's M and S for one side of the call. */
/** Mute and solo for a side (earshot's \`Player.Mute\` and \`Player.Solo\`). */
function SideControls({ speaker }: { speaker: "user" | "agent" }) {
  const button =
    "h-4 w-5 rounded-sm border font-mono text-[9px] leading-none font-semibold transition-colors hover:bg-muted disabled:opacity-40";
  return (
    <span className="flex gap-1">
      <Player.Mute
        speaker={speaker}
        className={`${button} aria-pressed:border-warning aria-pressed:bg-warning aria-pressed:text-background`}
      >
        M
      </Player.Mute>
      <Player.Solo
        speaker={speaker}
        title="Hear only this side, in both ears"
        className={`${button} aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground`}
      >
        S
      </Player.Solo>
    </span>
  );
}

/** Where hidden lanes were: a hairline that, pointed at or focused, offers them back. */
function RestoreStrip({ names, onShow }: { names: readonly string[]; onShow: () => void }) {
  const what = names.length === 1 ? names[0]! : `${names.length} hidden lanes`;
  return (
    <button
      type="button"
      aria-label={names.length === 1 ? `Show ${what}` : `Show ${what}: ${names.join(", ")}`}
      title={names.join(", ")}
      onClick={onShow}
      className="group/strip absolute inset-x-0 -top-1.5 -bottom-1.5 z-20 flex items-center outline-none"
    >
      <span className="bg-border group-hover/strip:bg-primary/60 group-focus-visible/strip:bg-primary h-px w-full" />
      <span className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap opacity-0 shadow-sm ring-1 transition-opacity group-hover/strip:opacity-100 group-focus-visible/strip:opacity-100">
        <Eye className="size-3" aria-hidden />
        Show {what}
      </span>
    </button>
  );
}
