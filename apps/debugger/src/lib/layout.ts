/* How the screen is split: the inspector's width, and the transcript's height under the timeline
 * and whether it's open. Remembered in this browser. The inspector's open state is its own stored
 * flag (`inspectorOpen`), since B, ⌘B and the toolbar already share it. */
import { createStored, KEYS, type Stored } from "./stored";

export type Share = `${number}%`;

export interface Layout {
  /** The inspector's width, in pixels. */
  inspector: number;
  /** The transcript's height, as a share of the space under the toolbar (so it follows the window). */
  transcript: Share;
  transcriptOpen: boolean;
}

export const DEFAULT_LAYOUT: Layout = { inspector: 416, transcript: "35%", transcriptOpen: true };

export const LIMITS = {
  inspector: { min: 300, max: 900 },
  /** The transcript's share; its least height is `min` pixels. */
  transcript: { min: 120, minShare: 10, maxShare: 80 },
} as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A stored width in pixels, kept within the limits. */
export function readPixels(v: unknown, limits: { min: number; max: number }): number | undefined {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(clamp(v, limits.min, limits.max))
    : undefined;
}

/** A stored share ("35%"), kept within the limits. */
export function readShare(v: unknown, limits: { minShare: number; maxShare: number }): Share | undefined {
  const m = typeof v === "string" ? /^(\d{1,3}(?:\.\d+)?)%$/.exec(v) : null;
  return m ? `${clamp(Number(m[1]), limits.minShare, limits.maxShare)}%` : undefined;
}

export function readLayout(raw: string): Layout | undefined {
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Layout, unknown>>;
    return {
      inspector: readPixels(v.inspector, LIMITS.inspector) ?? DEFAULT_LAYOUT.inspector,
      transcript: readShare(v.transcript, LIMITS.transcript) ?? DEFAULT_LAYOUT.transcript,
      transcriptOpen: typeof v.transcriptOpen === "boolean" ? v.transcriptOpen : true,
    };
  } catch {
    return undefined;
  }
}

export const layout: Stored<Layout> = createStored(KEYS.layout, DEFAULT_LAYOUT, readLayout, (v) =>
  JSON.stringify(v),
);
