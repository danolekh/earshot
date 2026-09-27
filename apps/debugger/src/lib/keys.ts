/* The debugger's keyboard, as a pure function: the scrubber's keys (earshot's `scrubberKey`) with
 * findings as the marks `[` `]` hop between (landing a lead-in before each, and saying which, so
 * the hop picks it), plus zoom, follow and the selection. Single keys work only inside the
 * debugger, and can be turned off (WCAG 2.1.4). */
import type { Conversation } from "@danolekh/earshot/core";
import { LEAD_IN } from "@danolekh/earshot/review";
import { type KeyAction, type KeyInput, type Mark, scrubberKey, type View } from "@danolekh/earshot/timeline";
import type { Finding } from "@danolekh/earshot/trace";

/** Where `[` `]` land for each finding: a lead-in before it, with its id; Shift: errors only. */
export function findingMarks(findings: readonly Finding[]): { marks: Mark[]; failures: Mark[] } {
  const mark = (f: Finding): Mark => ({ at: Math.max(0, f.start - LEAD_IN), id: f.id });
  return { marks: findings.map(mark), failures: findings.filter((f) => f.severity === "error").map(mark) };
}

export type DebuggerAction =
  | Exclude<KeyAction, null>
  | { type: "zoom-selection" }
  | { type: "clear" }
  | { type: "follow" }
  | { type: "help" }
  | { type: "sidebar" }
  | { type: "view" }
  | { type: "transcript" }
  /** Shows or hides one of the view's lane sets (LANE_SETS), by its index. */
  | { type: "lanes"; set: number }
  | null;

export interface DebuggerKeyContext {
  conversation: Conversation;
  time: number;
  view: View;
  findings: readonly Finding[];
  /** Single-key shortcuts on (the default). Arrows, Home/End and Escape work either way. */
  singleKeys: boolean;
}

const MODIFIED_OR_NAVIGATION = /^(Arrow|Page|Home|End|Escape)/;

export function debuggerKey(e: KeyInput, ctx: DebuggerKeyContext): DebuggerAction {
  if (e.metaKey || e.ctrlKey || (e.altKey && !e.key.startsWith("Arrow"))) return null;
  if (!ctx.singleKeys && !MODIFIED_OR_NAVIGATION.test(e.key)) return null;
  switch (e.key) {
    case "z":
    case "Z":
      return { type: "zoom-selection" };
    case "f":
    case "F":
      return { type: "follow" };
    case "Escape":
      return { type: "clear" };
    case "?":
      return { type: "help" };
    case "b":
    case "B":
      return { type: "sidebar" };
    case "v":
    case "V":
      return { type: "view" };
    case "t":
    case "T":
      return { type: "transcript" };
    case "1":
    case "2":
    case "3":
    case "4":
      return e.shiftKey ? null : { type: "lanes", set: Number(e.key) - 1 };
  }
  return scrubberKey(ctx.conversation, ctx.time, e, { view: ctx.view, ...findingMarks(ctx.findings) });
}
