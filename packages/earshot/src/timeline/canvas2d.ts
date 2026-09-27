/* The waveform drawn with the 2D canvas: rounded bars (a voice-note look) or a min/max trace (an
 * editor's), from either an amplitude overview or a min/max pyramid, picking the pyramid level that
 * has a bin per bar at the current zoom. Played bars take `--waveform-played`. */

import { peakBetween } from "../core/peaks";
import { levelFor, minMaxBetween, type PeakPyramid } from "../core/pyramid";
import type { Peaks } from "../core/types";
import type { LaneFrame, LaneRenderer } from "./renderer";

export type WaveformSource = Peaks | PeakPyramid;

export interface WaveformOptions {
  source: WaveformSource;
  /** Bar width and gap in CSS pixels (bars shape). */
  bar?: number;
  gap?: number;
  /** The smallest bar, as a fraction of the height. */
  floor?: number;
  /** `bars`: rounded, mirrored bars. `minmax`: each pixel column from its lowest to its highest
   * sample. */
  shape?: "bars" | "minmax";
}

const isPyramid = (s: WaveformSource): s is PeakPyramid => "levels" in s;

/** The loudest bin, so the pyramid fills the lane like a normalised overview does. */
function loudest(p: PeakPyramid): number {
  const top = p.levels.at(-1);
  let max = 0;
  if (top) for (let i = 0; i < top.min.length; i++) max = Math.max(max, -top.min[i]!, top.max[i]!);
  return max / 127 || 1;
}

export function createWaveformRenderer(options: WaveformOptions): LaneRenderer {
  const { source, bar = 2, gap = 1, floor = 0.06, shape = "bars" } = options;
  const scale = isPyramid(source) ? 1 / loudest(source) : 1;
  let g: CanvasRenderingContext2D | null = null;
  let colors = { base: "", played: "" };

  /** Lowest and highest (-1..1, normalised) over `[from, to)`. */
  const range = (from: number, to: number): readonly [number, number] => {
    if (!isPyramid(source)) {
      const v = peakBetween(source, from, to);
      return [-v, v];
    }
    const [lo, hi] = minMaxBetween(levelFor(source, to - from), from, to);
    return [Math.max(-1, lo * scale), Math.min(1, hi * scale)];
  };
  const layout = (f: LaneFrame) => {
    const step = shape === "bars" ? bar + gap : 1;
    const count = Math.max(1, Math.floor(f.width / step));
    const perBin = (f.view.to - f.view.from) / count;
    const edge = Math.max(0, Math.min(count, Math.floor((f.time - f.view.from) / perBin)));
    return { step, count, perBin, edge };
  };

  return {
    attach(canvas) {
      g = canvas.getContext("2d");
      return g !== null;
    },
    restyle(style) {
      colors = {
        base: style.color,
        played: style.getPropertyValue("--waveform-played").trim() || style.color,
      };
    },
    dirty(prev, next) {
      return (
        prev.view.from !== next.view.from ||
        prev.view.to !== next.view.to ||
        prev.width !== next.width ||
        prev.height !== next.height ||
        prev.dpr !== next.dpr ||
        prev.duration !== next.duration ||
        layout(prev).edge !== layout(next).edge
      );
    },
    draw(f) {
      if (!g) return;
      const { step, count, perBin, edge } = layout(f);
      g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
      g.clearRect(0, 0, f.width, f.height);
      const dim = colors.played === colors.base ? 0.35 : 1;
      for (let i = 0; i < count; i++) {
        const from = f.view.from + i * perBin;
        if (from >= f.duration) break;
        const [lo, hi] = range(Math.max(0, from), Math.min(f.duration, from + perBin));
        const played = i < edge;
        g.fillStyle = played ? colors.played : colors.base;
        g.globalAlpha = played ? 1 : dim;
        const x = i * step;
        if (shape === "minmax") {
          const top = ((1 - Math.max(hi, floor / 2)) / 2) * f.height;
          const bottom = ((1 - Math.min(lo, -floor / 2)) / 2) * f.height;
          g.fillRect(x, top, 1, Math.max(1, bottom - top));
          continue;
        }
        const v = Math.max(floor, Math.max(-lo, hi));
        const h = Math.max(1, v * f.height);
        const y = (f.height - h) / 2;
        if (g.roundRect) {
          g.beginPath();
          g.roundRect(x, y, bar, h, bar / 2);
          g.fill();
        } else g.fillRect(x, y, bar, h);
      }
      g.globalAlpha = 1;
    },
  };
}
