/* What the timeline shows: which lanes are hidden, and how tall they are. Remembered in this
 * browser, and the hidden lanes also go in the URL (`?hide=…`), so a shared link opens on the same
 * lanes. Stored as what's hidden, so a lane added later shows up.
 *
 * One on/off per lane; the sets (a side of the call, every word lane) and layouts ("Caller only")
 * are bulk switches over those, as Logic's groups or Premiere's Shift-click are. The last visible
 * lane can't be hidden (as in Chrome DevTools' track configuration). */
import {
  hidesEveryLane,
  lanesShown,
  onlyLanes as onlyShown,
  showLanes,
  toggleLanes,
} from "@danolekh/earshot/timeline";
import type { CallTrace } from "@danolekh/earshot/trace";

import { LANES, type LaneDef, type LaneId } from "@/debugger/lanes";

import { createStored, type Stored } from "./stored";

export const DENSITIES = ["compact", "comfortable", "expanded"] as const;
export type Density = (typeof DENSITIES)[number];

export interface ViewSettings {
  hidden: readonly LaneId[];
  density: Density;
}

export const DEFAULT_VIEW: ViewSettings = { hidden: [], density: "comfortable" };

export const isLaneId = (id: unknown): id is LaneId => LANES.some((l) => l.id === id);

function read(raw: string): ViewSettings | undefined {
  try {
    const v = JSON.parse(raw) as Partial<ViewSettings>;
    return {
      hidden: Array.isArray(v.hidden) ? v.hidden.filter(isLaneId) : [],
      density: DENSITIES.find((d) => d === v.density) ?? "comfortable",
    };
  } catch {
    return undefined;
  }
}

export const viewSettings: Stored<ViewSettings> = createStored("debugger:view", DEFAULT_VIEW, read, (v) =>
  JSON.stringify(v),
);

const ids = (pick: (l: LaneDef) => boolean): LaneId[] => LANES.filter(pick).map((l) => l.id);

export interface LaneSet {
  label: string;
  ids: readonly LaneId[];
}

/** Lanes that go together, in the order their number keys (1–4) toggle them. */
export const LANE_SETS: readonly LaneSet[] = [
  { label: "Caller lanes", ids: ids((l) => l.group === "caller") },
  { label: "Agent lanes", ids: ids((l) => l.group === "agent") },
  { label: "Pipeline lanes", ids: ids((l) => l.group === "pipeline") },
  { label: "Word lanes", ids: ids((l) => l.kind === "words") },
];

/** Layouts that show only some lanes (the findings always among them). */
export const LAYOUTS: readonly { label: string; shown: readonly LaneId[] }[] = [
  { label: "Caller only", shown: ids((l) => l.group === "call" || l.group === "caller") },
  { label: "Agent only", shown: ids((l) => l.group === "call" || l.group === "agent") },
];

/** The lanes to draw, in the registry's order. */
export const visibleLanes = (lanes: readonly LaneDef[], view: ViewSettings): LaneDef[] =>
  lanes.filter((l) => !view.hidden.includes(l.id));

const idsOf = (lanes: readonly LaneDef[]): LaneId[] => lanes.map((l) => l.id);

/** Shows or hides a set of lanes together (one lane, a side, every word lane). */
export const setLanes = (view: ViewSettings, lanes: readonly LaneId[], show: boolean): ViewSettings => ({
  ...view,
  hidden: showLanes(view.hidden, lanes, show),
});

/** Whether a set of lanes is all shown, all hidden, or some of each. */
export const shownState = (view: ViewSettings, lanes: readonly LaneId[]): boolean | "mixed" =>
  lanesShown(view.hidden, lanes);

/** Whether hiding these lanes would leave none of the call's (`all`: the lanes it has). */
export const wouldHideAll = (
  view: ViewSettings,
  lanes: readonly LaneId[],
  all: readonly LaneDef[] = LANES,
): boolean => hidesEveryLane(view.hidden, lanes, idsOf(all));

/** A set's switch: hides it when it's all shown (unless that would hide every lane: then the same
 * view back), shows all of it otherwise. */
export function toggleSet(
  view: ViewSettings,
  lanes: readonly LaneId[],
  all: readonly LaneDef[] = LANES,
): ViewSettings {
  const hidden = toggleLanes(view.hidden, lanes, idsOf(all));
  return hidden === view.hidden ? view : { ...view, hidden };
}

export const onlyLanes = (view: ViewSettings, shown: readonly LaneId[]): ViewSettings => ({
  ...view,
  hidden: onlyShown(idsOf(LANES), shown),
});

/** The lane a picked finding, span or turn is drawn on. */
export function laneOf(
  picked: { findingId?: string; spanId?: string; turnId?: string },
  trace: CallTrace,
): LaneId | undefined {
  if (picked.findingId) return "findings";
  if (picked.spanId) return "spans";
  const turn = picked.turnId ? trace.turns.find((t) => t.id === picked.turnId) : undefined;
  if (!turn) return undefined;
  // A mono recording draws both sides on one lane.
  if (trace.audio?.peaks?.mixed) return "call";
  return turn.channel === "caller" ? "caller" : "agent";
}
