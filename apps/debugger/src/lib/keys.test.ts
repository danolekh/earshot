import { LEAD_IN } from "@danolekh/earshot/review";
import { describe, expect, it } from "vitest";

import { demo } from "@/calls/demo";

import { debuggerKey } from "./keys";
import { prepare } from "./prepare";

const { conversation } = prepare(demo);
const key = (k: string, shiftKey = false, mod: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key: k,
  shiftKey,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mod,
});
const ctx = (time: number, singleKeys = true) => ({
  conversation,
  time,
  view: { from: 0, to: demo.call.duration },
  findings: demo.findings,
  singleKeys,
});

describe("debuggerKey", () => {
  it("hops from finding to finding, a lead-in before each, errors only with Shift", () => {
    const [a, b] = demo.findings;
    const lead = (start: number) => Math.round((start - LEAD_IN) * 1000) / 1000;
    const first = debuggerKey(key("]"), ctx(0));
    expect(first).toMatchObject({ type: "seek", mark: a!.id });
    expect(first?.type === "seek" && Math.round(first.to * 1000) / 1000).toBe(lead(a!.start));
    // From where that hop landed, the next finding (not the same one again).
    expect(debuggerKey(key("]"), ctx(a!.start - LEAD_IN))).toMatchObject({ mark: b!.id });
    const errors = demo.findings.filter((f) => f.severity === "error");
    const next = debuggerKey(key("]", true), ctx(errors[0]!.start + 0.1));
    expect(next).toMatchObject({ type: "seek", mark: errors[1]!.id });
  });

  it("zooms, pans and plays through earshot's scrubber keys", () => {
    expect(debuggerKey(key("w"), ctx(10))).toMatchObject({ type: "zoom", factor: 0.5, anchor: 10 });
    expect(debuggerKey(key(" "), ctx(10))).toEqual({ type: "toggle" });
    expect(debuggerKey(key("z"), ctx(10))).toEqual({ type: "zoom-selection" });
  });

  it("turns single keys off, keeping arrows and Escape (WCAG 2.1.4)", () => {
    expect(debuggerKey(key("w"), ctx(10, false))).toBeNull();
    expect(debuggerKey(key("]"), ctx(10, false))).toBeNull();
    expect(debuggerKey(key("Escape"), ctx(10, false))).toEqual({ type: "clear" });
    expect(debuggerKey(key("ArrowRight"), ctx(10, false))).toMatchObject({ type: "seek" });
  });

  it("folds the transcript with T", () => {
    expect(debuggerKey(key("t"), ctx(10))).toEqual({ type: "transcript" });
    expect(debuggerKey(key("t"), ctx(10, false))).toBeNull();
  });

  it("opens the View menu with V, and toggles lane sets with 1 to 4", () => {
    expect(debuggerKey(key("v"), ctx(10))).toEqual({ type: "view" });
    expect(debuggerKey(key("1"), ctx(10))).toEqual({ type: "lanes", set: 0 });
    expect(debuggerKey(key("4"), ctx(10))).toEqual({ type: "lanes", set: 3 });
    expect(debuggerKey(key("5"), ctx(10))).toBeNull();
    expect(debuggerKey(key("1"), ctx(10, false))).toBeNull();
  });

  it("opens and closes the inspector with B, leaving ⌘B and Ctrl+B to the sidebar", () => {
    expect(debuggerKey(key("b"), ctx(10))).toEqual({ type: "sidebar" });
    expect(debuggerKey(key("B", true), ctx(10))).toEqual({ type: "sidebar" });
    expect(debuggerKey(key("b"), ctx(10, false))).toBeNull();
    expect(debuggerKey(key("b", false, { metaKey: true }), ctx(10))).toBeNull();
    expect(debuggerKey(key("b", false, { ctrlKey: true }), ctx(10))).toBeNull();
  });
});
