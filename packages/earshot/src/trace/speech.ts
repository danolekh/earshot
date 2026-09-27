/* Where each side spoke, measured. A stereo recording says it per channel. A mono one mixes both
 * sides, so each stretch of speech in it goes to the side whose turn started most recently and is
 * still going: never both at once, so a mono call can't show talk-over it can't hear. Worked out
 * when read, never stored, so better turn edges give a better split. */
import type { CallTrace, Channel, Interval } from "./types";

type Placed = Pick<CallTrace, "speech"> & {
  turns: readonly { channel: Channel; start: number; end: number }[];
};

/** A channel's measured speech: its own, else its share of the mixed channel's, else none. */
export function measuredSpeech(trace: Placed, channel: Channel): readonly Interval[] | undefined {
  const own = trace.speech?.[channel];
  if (own) return own;
  const mixed = trace.speech?.mixed;
  if (!mixed) return undefined;
  const turns = [...trace.turns].sort((a, b) => a.start - b.start);
  // Whose it is from `t`: the latest turn to have started that's still going, else the latest to
  // have started at all (a pause at the end of a turn), else the first.
  const sideAt = (t: number) => {
    let going: Channel | undefined;
    let started: Channel | undefined;
    for (const turn of turns) {
      if (turn.start > t + 1e-6) break;
      started = turn.channel;
      if (turn.end > t + 1e-6) going = turn.channel;
    }
    return going ?? started ?? turns[0]?.channel;
  };
  const edges = turns.flatMap((t) => [t.start, t.end]);
  const out: Interval[] = [];
  for (const run of mixed) {
    const cuts = [...new Set(edges.filter((t) => t > run.start && t < run.end))].sort((a, b) => a - b);
    let from = run.start;
    for (const cut of [...cuts, run.end]) {
      if (cut > from && sideAt(from) === channel) {
        const last = out.at(-1);
        if (last && Math.abs(last.end - from) < 1e-9) last.end = cut;
        else out.push({ start: from, end: cut });
      }
      from = cut;
    }
  }
  return out;
}
