import { afterEach, describe, expect, it, vi } from "vitest";

import { createSelection } from "../player/selection";
import { manualClock } from "../test/fixtures";
import { createViewport } from "../timeline/viewport";
import { findingAt, momentFor } from "./moment";
import { applyMoment, currentMoment, watchMoment } from "./sync";

const targets = () => ({
  clock: manualClock(60),
  selection: createSelection(),
  viewport: createViewport(60),
});

afterEach(() => vi.useRealTimers());

describe("a moment on the player", () => {
  it("puts the view, the pick (a finding bringing its turn) and the time", () => {
    const t = targets();
    applyMoment(
      t,
      { t: 25.1, from: 20, to: 30, finding: "tool_error:t9" },
      { findings: [{ id: "tool_error:t9", turnId: "t9" }] },
    );
    expect(t.viewport.get()).toEqual({ from: 20, to: 30 });
    expect(t.selection.get()).toEqual({ turnId: "t9", findingId: "tool_error:t9" });
    expect(t.clock.time()).toBe(25.1);
  });

  it("reads back as the same moment, the whole call left out", () => {
    const t = targets();
    applyMoment(t, momentFor({ start: 25.4, finding: "f", turn: "t9" }));
    expect(currentMoment(t)).toEqual({ t: 25.1, turn: "t9", finding: "f" });
    t.viewport.set({ from: 20, to: 30 });
    expect(currentMoment(t)).toMatchObject({ from: 20, to: 30 });
  });

  it("is told once things settle", () => {
    vi.useFakeTimers();
    const t = targets();
    const seen: unknown[] = [];
    const watch = watchMoment(t, (m) => seen.push(m));
    t.selection.set({ turnId: "t1" });
    t.clock.seek(12);
    vi.advanceTimersByTime(260);
    expect(seen).toEqual([{ t: 12, turn: "t1" }]);
    watch.dispose();
  });

  it("names the finding a lead-in landing is at", () => {
    const findings = [{ start: 10, end: 10, id: "a" }];
    expect(findingAt(findings, 9.7)?.id).toBe("a");
    expect(findingAt(findings, 10.2)?.id).toBe("a");
    expect(findingAt(findings, 11)).toBeUndefined();
  });
});
