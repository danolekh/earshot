/* What the debugger works out once per call: the plain conversation the player reads, each side's
 * waveform pyramid (or the one mixed recording's), the words per source, and quick lookups. */
import { buildPyramid, decodePeakLevel, type PeakPyramid } from "@danolekh/earshot/core";
import {
  type AudioChannel,
  blindSpots,
  type CallTrace,
  type FindingType,
  toConversation,
  type TraceWord,
} from "@danolekh/earshot/trace";

export interface Prepared {
  trace: CallTrace;
  conversation: ReturnType<typeof toConversation>;
  /** Per side, or one for a mono recording (`mixed`). */
  pyramids: Partial<Record<AudioChannel, PeakPyramid>>;
  words: { heard: TraceWord[]; said: TraceWord[]; agent: TraceWord[] };
  turnById: Map<string, CallTrace["turns"][number]>;
  /** What the stack didn't record: the findings no detector can look for here, and why. */
  blind: Partial<Record<FindingType, string>>;
}

export function prepare(trace: CallTrace): Prepared {
  const pyramids: Partial<Record<AudioChannel, PeakPyramid>> = {};
  for (const channel of ["caller", "agent", "mixed"] as const) {
    const level = trace.audio?.peaks?.[channel];
    if (level) pyramids[channel] = buildPyramid(decodePeakLevel(level));
  }
  return {
    trace,
    conversation: toConversation(trace),
    pyramids,
    words: {
      heard: trace.words.filter((w) => w.source === "streaming_asr"),
      said: trace.words.filter((w) => w.source === "aligned"),
      agent: trace.words.filter((w) => w.source === "tts"),
    },
    turnById: new Map(trace.turns.map((t) => [t.id, t])),
    blind: blindSpots(trace),
  };
}
