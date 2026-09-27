/* Sources that belong to no provider: the recording (its start is the surest time 0, and its
 * waveform shows when each side spoke), a reference transcript (what was said, timed), and call
 * details known from elsewhere. */
import { encodePeakLevel, type EncodedPeakLevel, type PeakLevel } from "../core/pyramid";
import { speechFromPeaks } from "../trace/analysis";
import type { AudioChannel, CallMeta, Interval } from "../trace/types";
import type { Source, WordDraft } from "./read";

export interface RecordingInput {
  /** Unix milliseconds of the recording's first sample. */
  startedAtUnixMs?: number;
  /** The files, best format first. */
  sources?: readonly { src: string; type: string }[];
  /** What each audio channel carries, in order. */
  channels?: readonly AudioChannel[];
  sampleRate?: number;
  /** The finest waveform level per channel. Speech is found in it unless given. */
  peaks?: Partial<Record<AudioChannel, PeakLevel>>;
  speech?: Partial<Record<AudioChannel, readonly Interval[]>>;
}

/** The recording: time 0 at its first sample, its files, its waveform and the speech in it. */
export function recording(input: RecordingInput): Source {
  const levels = Object.entries(input.peaks ?? {}) as [AudioChannel, PeakLevel][];
  return {
    name: "recording",
    anchors:
      input.startedAtUnixMs !== undefined
        ? [{ unixNs: BigInt(Math.round(input.startedAtUnixMs * 1000)) * 1000n, rank: "recording" }]
        : [],
    read: () => {
      const peaks = Object.fromEntries(levels.map(([ch, l]) => [ch, encodePeakLevel(l)])) as Partial<
        Record<AudioChannel, EncodedPeakLevel>
      >;
      const speech =
        input.speech ??
        (levels.length ? Object.fromEntries(levels.map(([ch, l]) => [ch, speechFromPeaks(l)])) : undefined);
      return {
        ...((input.sources || levels.length > 0) && {
          audio: { ...(input.sources && { sources: input.sources }), ...(levels.length > 0 && { peaks }) },
        }),
        ...((input.channels || input.sampleRate !== undefined) && {
          clock: {
            ...(input.channels && { channels: input.channels }),
            ...(input.sampleRate !== undefined && { sampleRate: input.sampleRate }),
          },
        }),
        ...(speech && { speech }),
      };
    },
  };
}

/** Words timed by something other than the provider: a second transcription of the recording, or
 * a forced alignment of what was said. They replace any of the same channel and source, and move a
 * turn's guessed edges onto them. */
export function timedWords(words: readonly WordDraft[]): Source {
  return { name: "words", read: () => ({ words }) };
}

/** Details of the call known from elsewhere (its title, what it was for); they win over the
 * provider's. */
export function callMeta(call: Partial<CallMeta>): Source {
  return { name: "call", read: () => ({ call }) };
}
