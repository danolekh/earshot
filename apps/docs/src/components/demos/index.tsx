import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// Each demo, and its source for the Code tab, loads only on the page that shows it.
type Demo = {
  Component: LazyExoticComponent<ComponentType>;
  source: () => Promise<string>;
  file: string;
};

const demo = <M,>(
  load: () => Promise<M>,
  pick: (m: M) => ComponentType,
  source: () => Promise<{ default: string }>,
  file: string,
): Demo => ({
  Component: lazy(() => load().then((m) => ({ default: pick(m) }))),
  source: () => source().then((m) => m.default),
  file,
});

export const demos = {
  "call-review": demo(
    () => import("./call-review-demo"),
    (m) => m.CallReviewDemo,
    () => import("../../../registry/earshot/call-review.tsx?raw"),
    "call-review.tsx",
  ),
  "call-inspector": demo(
    () => import("./call-inspector-demo"),
    (m) => m.CallInspectorDemo,
    () => import("../../../registry/earshot/call-inspector.tsx?raw"),
    "call-inspector.tsx",
  ),
  orb: demo(
    () => import("./orb-demo"),
    (m) => m.OrbDemo,
    () => import("./orb-demo.tsx?raw"),
    "orb-demo.tsx",
  ),
  visualizer: demo(
    () => import("./visualizer-demo"),
    (m) => m.VisualizerDemo,
    () => import("./visualizer-demo.tsx?raw"),
    "visualizer-demo.tsx",
  ),
  "live-transcript": demo(
    () => import("./live-transcript-demo"),
    (m) => m.LiveTranscriptDemo,
    () => import("./live-transcript-demo.tsx?raw"),
    "live-transcript-demo.tsx",
  ),
  "call-review-skins": demo(
    () => import("../home/skin-switcher"),
    (m) => m.SkinSwitcher,
    () => import("../../../src/skins/skins.css?raw"),
    "skins.css",
  ),
} satisfies Record<string, Demo>;

export type DemoName = keyof typeof demos;
