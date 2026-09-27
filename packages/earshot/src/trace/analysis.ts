/* What the recording itself says, joined to what the pipeline reported: speech found in the same
 * peaks the waveform draws (so a gap on screen is the gap the detectors measure), and words
 * aligned after the call. */

import { encodePeakLevel, type PeakLevel } from "../core/pyramid";
import { createTrace } from "./trace";
import type { AudioChannel, CallTrace, Interval, TraceWord } from "./types";

export interface SpeechOptions {
  /** Percentile of bin loudness taken as the noise floor. Default 10. */
  floorPercentile?: number;
  /** How far above the floor (dB) counts as speech. Default 12. */
  openDb?: number;
  /** Nothing quieter than this (dBFS) is speech, whatever the floor. Default -50. */
  minDb?: number;
  /** Pauses shorter than this (seconds) don't split speech. Default 0.2. */
  bridge?: number;
  /** Speech shorter than this (seconds) is dropped as a click. Default 0.06. */
  minSpeech?: number;
}

const toDb = (amplitude: number): number => 20 * Math.log10(Math.max(amplitude, 1e-6));

/** Where a channel has speech, from its finest peak level: loud enough above its own noise floor,
 * short pauses bridged, clicks dropped. Interval ends are where the sound stopped, not padded. */
export function speechFromPeaks(level: PeakLevel, options: SpeechOptions = {}): Interval[] {
  const { floorPercentile = 10, openDb = 12, minDb = -50, bridge = 0.2, minSpeech = 0.06 } = options;
  const bins = level.min.length;
  if (!bins) return [];
  const db = new Float32Array(bins);
  for (let i = 0; i < bins; i++) db[i] = toDb(Math.max(-level.min[i]!, level.max[i]!) / 127);
  const sorted = Float32Array.from(db).sort();
  const floor = sorted[Math.min(bins - 1, Math.floor((floorPercentile / 100) * bins))]!;
  const threshold = Math.max(floor + openDb, minDb);
  const at = (bin: number) => Math.round((bin / level.rate) * 1e6) / 1e6;

  const runs: Interval[] = [];
  let from = -1;
  for (let i = 0; i <= bins; i++) {
    const loud = i < bins && db[i]! >= threshold;
    if (loud && from < 0) from = i;
    if (!loud && from >= 0) {
      runs.push({ start: at(from), end: at(i) });
      from = -1;
    }
  }
  const merged: Interval[] = [];
  for (const r of runs) {
    const last = merged.at(-1);
    if (last && r.start - last.end < bridge) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.end - r.start >= minSpeech);
}

/** A trace with what was worked out from the recording added: the finest peak level and the
 * speech per channel, and words (replacing any of the same channel and source). */
export function mergeAnalysis(
  trace: CallTrace,
  analysis: {
    peaks?: Partial<Record<AudioChannel, PeakLevel>>;
    speech?: Partial<Record<AudioChannel, readonly Interval[]>>;
    words?: readonly (Omit<TraceWord, "id"> & { id?: string })[];
  },
): CallTrace {
  const replaced = new Set((analysis.words ?? []).map((w) => `${w.channel}:${w.source}`));
  const words = [
    ...trace.words
      .filter((w) => !replaced.has(`${w.channel}:${w.source}`))
      .map((w) => ({ ...w, id: undefined })),
    ...(analysis.words ?? []).map((w) => ({ ...w, id: undefined })),
  ];
  const peaks = { ...trace.audio?.peaks };
  for (const [channel, level] of Object.entries(analysis.peaks ?? {}) as [AudioChannel, PeakLevel][])
    peaks[channel] = encodePeakLevel(level);
  return createTrace({
    ...trace,
    ...(trace.audio || analysis.peaks
      ? { audio: { sources: trace.audio?.sources ?? [], ...(Object.keys(peaks).length > 0 && { peaks }) } }
      : {}),
    speech: { ...trace.speech, ...analysis.speech },
    words,
  });
}
