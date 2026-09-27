/* The transcript under the lanes, following playback: the primary way through the call for a
 * screen reader. Caller turns show what was said, with the words the agent didn't hear marked and
 * what it heard beneath; agent words it never got to say stay struck through; each turn carries
 * its findings. Clicking a turn picks it. */

import { usePlayer } from "@danolekh/earshot/player";
import { findingShort, heardDiff, missedSaid } from "@danolekh/earshot/trace";
import { Transcript } from "@danolekh/earshot/transcript";
import { useMemo } from "react";

import type { Prepared } from "@/lib/prepare";

import { FindingIcon } from "./finding-icon";

export function CallTranscript({ prepared }: { prepared: Prepared }) {
  const { trace } = prepared;
  const { selection } = usePlayer("CallTranscript");
  // Per caller turn: the said words the agent missed (by index), and what it heard.
  const missed = useMemo(() => {
    const out = new Map<string, { missing: ReadonlySet<number>; heard: string }>();
    for (const turn of trace.turns) {
      if (turn.channel !== "caller") continue;
      const d = heardDiff(trace, turn.id);
      const missing = d ? missedSaid(d) : undefined;
      if (d && missing?.size) out.set(turn.id, { missing, heard: d.heard.map((w) => w.text).join(" ") });
    }
    return out;
  }, [trace]);
  const findingsFor = (turnId: string) => trace.findings.filter((f) => f.turnId === turnId);
  return (
    <Transcript.Root className="transcript">
      <Transcript.Resume className="resume">Follow playback</Transcript.Resume>
      <Transcript.Turns>
        {(turn) => {
          const miss = missed.get(turn.id);
          const found = findingsFor(turn.id);
          return (
            <Transcript.Turn
              key={turn.id}
              turn={turn}
              className="turn"
              onClick={() => selection.set({ turnId: turn.id })}
            >
              {/* The keyboard's way to pick the turn; a click anywhere on it does the same. */}
              <Transcript.Pick className="turn-head">
                <Transcript.Speaker className="speaker" />
                <Transcript.Time className="time" />
                {found.map((f) => (
                  <span key={f.id} className="finding-chip" data-severity={f.severity}>
                    <FindingIcon type={f.type} severity={f.severity} className="size-3" />
                    {findingShort(f.type)}
                  </span>
                ))}
              </Transcript.Pick>
              <p className="turn-text">
                <Transcript.Words>
                  {(_word, i) => (
                    <Transcript.Word
                      key={i}
                      index={i}
                      className="word"
                      data-missed={miss?.missing.has(i) || undefined}
                      title={miss?.missing.has(i) ? "Not heard by the agent" : undefined}
                    />
                  )}
                </Transcript.Words>
              </p>
              {miss && (
                <p className="heard-line">
                  Agent heard: <q>{miss.heard}</q>
                </p>
              )}
            </Transcript.Turn>
          );
        }}
      </Transcript.Turns>
    </Transcript.Root>
  );
}
