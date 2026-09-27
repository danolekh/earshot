/* The URL and the debugger's state kept in step: what's in the URL is applied once, after the page
 * has hydrated (the prerendered HTML can't know it), and from then on the view, the selection and
 * (when paused or after a seek) the time are written back once they settle (earshot's
 * `applyMoment` and `watchMoment`), with the lanes hidden here. */
import type { Clock } from "@danolekh/earshot/core";
import type { SelectionStore } from "@danolekh/earshot/player";
import { applyMoment, watchMoment } from "@danolekh/earshot/review";
import type { Viewport } from "@danolekh/earshot/timeline";
import { useEffect } from "react";

import type { DebugSearch } from "./search";
import type { Stored } from "./stored";
import { isLaneId, type ViewSettings } from "./view";

export function useUrlSync(options: {
  search: DebugSearch;
  clock: Clock;
  viewport: Viewport;
  selection: SelectionStore;
  /** So a link to a finding opens with its turn picked. */
  findings: readonly { id: string; turnId?: string }[];
  view: Stored<ViewSettings>;
  navigate: (search: DebugSearch) => void;
}): void {
  const { clock, viewport, selection, view, navigate } = options;
  // Applied once, on mount: later changes come from the stores, not the URL.
  useEffect(() => {
    const { hide, ...moment } = options.search;
    // A link's lanes win over the ones remembered here, and are remembered from then on.
    if (hide) view.set({ ...view.get(), hidden: hide.split(",").filter(isLaneId) });
    applyMoment({ clock, selection, viewport }, moment, { findings: options.findings });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  useEffect(() => {
    const watch = watchMoment({ clock, selection, viewport }, (moment) => {
      const hidden = view.get().hidden;
      navigate({ ...moment, ...(hidden.length > 0 && { hide: hidden.join(",") }) });
    });
    const offLanes = view.subscribe(watch.schedule);
    return () => {
      watch.dispose();
      offLanes();
    };
  }, [clock, viewport, selection, view, navigate]);
}
