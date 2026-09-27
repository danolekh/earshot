import { type Conversation, createLiveConversation } from "@danolekh/earshot/core";
import { Transcript } from "@danolekh/earshot/transcript";
import { useEffect, useMemo, useState } from "react";

import call from "@/calls/alder-mutual-address.json";

/** The insurance call replayed as if it were live: turns open, words stream in as they're spoken,
 * the agent gets cut off. The transcript part doesn't know the difference. */
export function LiveTranscriptDemo() {
  const [run, setRun] = useState(0);
  return <Replay key={run} onReplay={() => setRun((r) => r + 1)} />;
}

function Replay({ onReplay }: { onReplay: () => void }) {
  const live = useMemo(() => createLiveConversation(), []);
  useEffect(() => {
    const c = call as unknown as Conversation;
    const start = performance.now();
    const open = new Map<string, string>();
    const sent = new Map<string, number>();
    const id = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      live.setNow(t);
      for (const turn of c.turns) {
        if (turn.start > t) break;
        let lid = open.get(turn.id);
        if (!lid && !sent.has(turn.id)) {
          lid = live.begin(turn.role, turn.start, { speaker: turn.speaker });
          open.set(turn.id, lid);
          sent.set(turn.id, 0);
        }
        if (!lid) continue;
        const n = sent.get(turn.id)!;
        const due = turn.words.filter((w) => w.start <= t).length;
        if (due > n) {
          live.appendWords(lid, turn.words.slice(n, due));
          sent.set(turn.id, due);
        }
        if (turn.interruptedAt !== undefined && t >= turn.interruptedAt) {
          live.truncate(lid, turn.interruptedAt);
          open.delete(turn.id);
        } else if (t >= turn.end) {
          live.finalize(lid, turn.end);
          open.delete(turn.id);
        }
      }
      if (t > c.duration) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [live]);

  return (
    <div className="grid w-full gap-3">
      <Transcript.Root
        conversation={live}
        live
        className="grid h-72 content-start gap-3 overflow-auto text-sm"
      >
        <Transcript.Turns>
          {(turn) => (
            <Transcript.Turn
              key={turn.id}
              turn={turn}
              className="data-[streaming]:text-fd-muted-foreground data-[role=user]:border-fd-border grid gap-0.5 data-[role=user]:border-l-2 data-[role=user]:pl-3"
            >
              <Transcript.Speaker className="text-fd-muted-foreground text-xs font-medium" />
              <span>
                <Transcript.Words />
                {turn.interruptedAt !== undefined && <span className="text-red-400"> (cut off)</span>}
              </span>
            </Transcript.Turn>
          )}
        </Transcript.Turns>
      </Transcript.Root>
      <button
        type="button"
        onClick={onReplay}
        className="text-fd-muted-foreground justify-self-start text-xs underline"
      >
        Replay
      </button>
    </div>
  );
}
