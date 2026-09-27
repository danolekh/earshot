/* Which lanes a timeline shows, as plain functions over lane ids, for an app to keep wherever it
 * keeps its view (a store, the URL). Kept as what's hidden, so a lane added later shows up. One
 * rule: the last lane shown can't be hidden (as in Chrome DevTools' track configuration). */

/** `hidden` with `ids` shown, or hidden too. */
export function showLanes<Id extends string>(hidden: readonly Id[], ids: readonly Id[], show: boolean): Id[] {
  return show ? hidden.filter((id) => !ids.includes(id)) : [...new Set([...hidden, ...ids])];
}

/** Whether a set of lanes is all shown, all hidden, or some of each. */
export function lanesShown<Id extends string>(hidden: readonly Id[], ids: readonly Id[]): boolean | "mixed" {
  const shown = ids.filter((id) => !hidden.includes(id)).length;
  return shown === ids.length ? true : shown === 0 ? false : "mixed";
}

/** Whether hiding `ids` would leave none of `all` shown. */
export function hidesEveryLane<Id extends string>(
  hidden: readonly Id[],
  ids: readonly Id[],
  all: readonly Id[],
): boolean {
  const next = showLanes(hidden, ids, false);
  return all.every((id) => next.includes(id));
}

/** A set's switch: hides it when it's all shown (the same `hidden` back when that would hide every
 * lane, so the caller can say why nothing changed), shows all of it otherwise. */
export function toggleLanes<Id extends string>(
  hidden: readonly Id[],
  ids: readonly Id[],
  all: readonly Id[],
): readonly Id[] {
  if (lanesShown(hidden, ids) !== true) return showLanes(hidden, ids, true);
  return hidesEveryLane(hidden, ids, all) ? hidden : showLanes(hidden, ids, false);
}

/** What's hidden to show only `shown` of `all`. */
export const onlyLanes = <Id extends string>(all: readonly Id[], shown: readonly Id[]): Id[] =>
  all.filter((id) => !shown.includes(id));

export type LaneRow<Id extends string> = { lane: Id } | { strip: Id[] };

/** The rows a timeline draws, in order: each lane shown, and one strip for each run of hidden
 * lanes where they were, which can show them again. */
export function laneRows<Id extends string>(all: readonly Id[], hidden: readonly Id[]): LaneRow<Id>[] {
  const out: LaneRow<Id>[] = [];
  let run: Id[] = [];
  for (const id of all) {
    if (hidden.includes(id)) run.push(id);
    else {
      if (run.length) out.push({ strip: run });
      run = [];
      out.push({ lane: id });
    }
  }
  if (run.length) out.push({ strip: run });
  return out;
}
