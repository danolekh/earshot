import { describe, expect, it } from "vitest";

import { hidesEveryLane, laneRows, lanesShown, onlyLanes, showLanes, toggleLanes } from "./lanes";

const ALL = ["findings", "caller", "heard", "said", "turns", "agent", "words", "spans"] as const;
type Id = (typeof ALL)[number];
const CALLER: Id[] = ["caller", "heard", "said"];
const AGENT: Id[] = ["agent", "words"];
const PIPELINE: Id[] = ["turns", "spans"];
const shown = (hidden: readonly Id[]) => ALL.filter((id) => !hidden.includes(id));

describe("lane visibility", () => {
  it("hides and shows lanes together, without hiding one twice", () => {
    const hidden = showLanes<Id>([], ["heard", "said"], false);
    expect(shown(hidden)).toEqual(["findings", "caller", "turns", "agent", "words", "spans"]);
    expect(showLanes(showLanes(hidden, ["said"], false), ["heard"], true)).toEqual(["said"]);
  });

  it("says whether a set is shown, hidden, or partly", () => {
    expect(lanesShown<Id>([], CALLER)).toBe(true);
    expect(lanesShown<Id>(["heard"], CALLER)).toBe("mixed");
    expect(lanesShown<Id>(CALLER, CALLER)).toBe(false);
  });

  it("toggles a set, but never hides the last lane, and says so by giving the same list back", () => {
    let hidden: readonly Id[] = [];
    for (const set of [CALLER, AGENT, PIPELINE]) hidden = toggleLanes(hidden, set, ALL);
    expect(shown(hidden)).toEqual(["findings"]);
    expect(hidesEveryLane(hidden, ["findings"], ALL)).toBe(true);
    const callerOnly = onlyLanes(ALL, CALLER);
    expect(toggleLanes(callerOnly, CALLER, ALL)).toBe(callerOnly);
    expect(shown(toggleLanes(["heard"], CALLER, ALL))).toEqual(ALL);
  });
});

describe("the rows a timeline draws", () => {
  it("folds each run of hidden lanes into one strip where they were", () => {
    expect(laneRows(ALL, ["heard", "said", "spans"])).toEqual([
      { lane: "findings" },
      { lane: "caller" },
      { strip: ["heard", "said"] },
      { lane: "turns" },
      { lane: "agent" },
      { lane: "words" },
      { strip: ["spans"] },
    ]);
  });
});
