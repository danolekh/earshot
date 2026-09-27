import { afterEach, describe, expect, it } from "vitest";

import { FIRST_PAINT_SCRIPT } from "./first-paint";
import { DEFAULT_LAYOUT, readLayout } from "./layout";
import { KEYS } from "./stored";

describe("the stored layout", () => {
  it("reads what was stored, within the limits", () => {
    expect(
      readLayout(JSON.stringify({ inspector: 480, transcript: "28.5%", transcriptOpen: false })),
    ).toEqual({
      inspector: 480,
      transcript: "28.5%",
      transcriptOpen: false,
    });
    expect(readLayout(JSON.stringify({ inspector: 5000, transcript: "95%" }))).toEqual({
      inspector: 900,
      transcript: "80%",
      transcriptOpen: true,
    });
  });

  it("falls back to the defaults for anything it doesn't recognise", () => {
    expect(readLayout(JSON.stringify({ inspector: "wide", transcript: 300, transcriptOpen: "no" }))).toEqual(
      DEFAULT_LAYOUT,
    );
    expect(readLayout("not json")).toBeUndefined();
  });
});

describe("the first-paint script", () => {
  const root = document.documentElement;
  afterEach(() => {
    localStorage.clear();
    root.removeAttribute("style");
    delete root.dataset.inspector;
    delete root.dataset.transcript;
  });
  const run = () => new Function(FIRST_PAINT_SCRIPT)();

  it("puts the stored sizes and closed panels on <html> before the first paint", () => {
    localStorage.setItem(
      KEYS.layout,
      JSON.stringify({ inspector: 480, transcript: "28.5%", transcriptOpen: false }),
    );
    localStorage.setItem(KEYS.inspector, "off");
    run();
    expect(root.style.getPropertyValue("--layout-inspector")).toBe("480px");
    expect(root.style.getPropertyValue("--layout-transcript")).toBe("28.5%");
    expect(root.dataset.transcript).toBe("closed");
    expect(root.dataset.inspector).toBe("closed");
  });

  it("leaves the defaults to the CSS when nothing sensible is stored", () => {
    localStorage.setItem(KEYS.layout, JSON.stringify({ inspector: 5, transcript: "999%" }));
    run();
    expect(root.style.getPropertyValue("--layout-inspector")).toBe("");
    expect(root.style.getPropertyValue("--layout-transcript")).toBe("");
    expect(root.dataset.transcript).toBeUndefined();
  });
});
