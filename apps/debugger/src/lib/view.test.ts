import { describe, expect, it } from "vitest";

import { demo } from "@/calls/demo";
import { LANES } from "@/debugger/lanes";

import {
  DEFAULT_VIEW,
  LANE_SETS,
  LAYOUTS,
  laneOf,
  onlyLanes,
  setLanes,
  shownState,
  toggleSet,
  visibleLanes,
  wouldHideAll,
} from "./view";

const words = LANES.filter((l) => l.kind === "words").map((l) => l.id);
/** The lanes a stereo call has (the demo's): all but the mono recording's. */
const STEREO = LANES.filter((l) => l.id !== "call");

describe("view settings", () => {
  it("hides and shows lanes together, keeping the registry's order", () => {
    const hidden = setLanes(DEFAULT_VIEW, words, false);
    expect(visibleLanes(STEREO, hidden).map((l) => l.id)).toEqual([
      "findings",
      "caller",
      "turns",
      "agent",
      "spans",
      "context",
    ]);
    expect(setLanes(hidden, ["heard"], true).hidden).toEqual(["said", "agent-words"]);
    expect(setLanes(hidden, words, true).hidden).toEqual([]);
  });

  it("doesn't hide a lane twice", () => {
    expect(setLanes(setLanes(DEFAULT_VIEW, ["said"], false), words, false).hidden).toEqual([
      "said",
      "heard",
      "agent-words",
    ]);
  });

  it("says whether a set of lanes is shown, hidden, or partly", () => {
    expect(shownState(DEFAULT_VIEW, words)).toBe(true);
    expect(shownState(setLanes(DEFAULT_VIEW, ["said"], false), words)).toBe("mixed");
    expect(shownState(setLanes(DEFAULT_VIEW, words, false), words)).toBe(false);
  });

  it("toggles a set: hides it when all shown, otherwise shows all of it", () => {
    const [caller] = LANE_SETS;
    const hidden = toggleSet(DEFAULT_VIEW, caller!.ids);
    expect(shownState(hidden, caller!.ids)).toBe(false);
    const partly = setLanes(DEFAULT_VIEW, ["heard"], false);
    expect(shownState(toggleSet(partly, caller!.ids), caller!.ids)).toBe(true);
  });

  it("never hides the last lane", () => {
    const onlyFindings = onlyLanes(DEFAULT_VIEW, ["findings"]);
    expect(wouldHideAll(onlyFindings, ["findings"], STEREO)).toBe(true);
    // Hiding both sides and the pipeline leaves the findings (the word lanes went with the sides).
    let view = DEFAULT_VIEW;
    for (const set of LANE_SETS.slice(0, 3)) view = toggleSet(view, set.ids, STEREO);
    expect(visibleLanes(STEREO, view).map((l) => l.id)).toEqual(["findings"]);
    // The caller's lanes are all that's shown: its switch can't hide them.
    const callerLanes = onlyLanes(DEFAULT_VIEW, LANE_SETS[0]!.ids);
    expect(toggleSet(callerLanes, LANE_SETS[0]!.ids, STEREO)).toBe(callerLanes);
  });

  it("shows only one side, the findings with it", () => {
    const callerOnly = onlyLanes(DEFAULT_VIEW, LAYOUTS[0]!.shown);
    expect(visibleLanes(STEREO, callerOnly).map((l) => l.id)).toEqual([
      "findings",
      "caller",
      "heard",
      "said",
    ]);
  });

  it("knows which lane a picked finding, span or turn is on", () => {
    const span = demo.spans[0]!;
    const callerTurn = demo.turns.find((t) => t.channel === "caller")!;
    expect(laneOf({ findingId: demo.findings[0]!.id }, demo)).toBe("findings");
    expect(laneOf({ spanId: span.id }, demo)).toBe("spans");
    expect(laneOf({ turnId: callerTurn.id }, demo)).toBe("caller");
    expect(laneOf({}, demo)).toBeUndefined();
  });
});
