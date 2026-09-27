/* When what's picked (a finding, a span, a turn) is drawn on a lane that's hidden, say so and offer
 * to show it: jumping to a finding works whatever is shown, so the lane shouldn't silently hide
 * where you landed. */
import { usePlayer } from "@danolekh/earshot/player";
import type { CallTrace } from "@danolekh/earshot/trace";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { laneOf, type ViewSettings } from "@/lib/view";

import { LANES, type LaneId, laneName } from "./lanes";

export function HiddenNotice({
  trace,
  view,
  onShow,
}: {
  trace: CallTrace;
  view: ViewSettings;
  onShow: (id: LaneId) => void;
}) {
  const { selection } = usePlayer("HiddenNotice");
  const picked = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
  const lane = laneOf(picked, trace);
  const def = lane && view.hidden.includes(lane) ? LANES.find((l) => l.id === lane) : undefined;
  const what = picked.findingId ? "finding" : picked.spanId ? "span" : "turn";
  return (
    <output className="pointer-events-none absolute right-3 bottom-2 z-20">
      {def && (
        <span className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-auto flex items-center gap-2 rounded-md py-1 pr-1 pl-2.5 text-xs shadow-md ring-1">
          The picked {what} is on the hidden {laneName(def)} lane.
          <Button size="xs" variant="outline" onClick={() => onShow(def.id)}>
            Show it
          </Button>
        </span>
      )}
    </output>
  );
}
