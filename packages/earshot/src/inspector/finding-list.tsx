"use client";
/* A call's findings as a list to pick from: each a button, `aria-current` while it's the pick,
 * picking it and its turn and playing from a lead-in before it (a `Timeline.Root` that reveals
 * pages to it). One tab stop for the list; the arrows, Home and End move between findings. */
import type * as React from "react";
import { createContext, useContext, useRef, useState, useSyncExternalStore } from "react";

import { usePlayer, useSelected } from "../player/context";
import { LEAD_IN, momentFor } from "../review/moment";
import { applyMoment } from "../review/sync";
import type { Finding } from "../trace/types";
import { type PartProps, usePart } from "../utils/part";

/** What the list needs of a finding (a `Finding`, or a list's `FindingSummary`). */
export type ListedFinding = Pick<Finding, "id" | "type" | "severity" | "start" | "message"> & {
  turnId?: string;
};

interface FindingListContextValue {
  leadIn: number;
  /** The item that takes the list's tab stop. */
  tabStop: string | undefined;
  focused(id: string): void;
}

const FindingListContext = createContext<FindingListContextValue | null>(null);

export interface FindingListRootProps<F extends ListedFinding = ListedFinding> extends Omit<
  PartProps<"ul", Record<string, never>>,
  "children"
> {
  findings: readonly F[];
  /** How long before a finding playback starts (seconds). */
  leadIn?: number;
  /** Each finding, in an `<li>`; a `FindingList.Item` by default. */
  children?: (finding: F) => React.ReactNode;
}

/** The findings. Inside a `Player.Root`. Renders a `<ul>`. */
export function FindingListRoot<F extends ListedFinding>(props: FindingListRootProps<F>): React.ReactElement {
  const { findings, leadIn = LEAD_IN, children, ...rest } = props;
  const { selection } = usePlayer("FindingList.Root");
  const [last, setLast] = useState<string>();
  const ref = useRef<HTMLElement>(null);
  const picked = useSyncExternalStore(
    selection.subscribe,
    () => selection.get().findingId,
    () => undefined,
  );
  const tabStop = [last, picked, findings[0]?.id].find((id) => id && findings.some((f) => f.id === id));
  const element = usePart(
    "finding-list",
    "ul",
    {},
    rest as PartProps<"ul", Record<string, never>>,
    {
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>("[data-slot=finding-list-item]") ?? []),
        ];
        const at = items.indexOf(e.target as HTMLElement);
        if (at === -1) return;
        const to =
          e.key === "ArrowDown"
            ? Math.min(items.length - 1, at + 1)
            : e.key === "ArrowUp"
              ? Math.max(0, at - 1)
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : -1;
        if (to === -1) return;
        e.preventDefault();
        items[to]!.focus();
      },
      children: findings.map((f) =>
        children ? (
          children(f)
        ) : (
          <li key={f.id}>
            <FindingListItem finding={f} />
          </li>
        ),
      ),
    },
    [ref as React.Ref<never>],
  );
  return (
    <FindingListContext.Provider value={{ leadIn, tabStop, focused: setLast }}>
      {element}
    </FindingListContext.Provider>
  );
}

export interface FindingListItemState extends Record<string, unknown> {
  type: Finding["type"];
  severity: Finding["severity"];
  /** It's the pick. */
  selected: boolean;
}

export interface FindingListItemProps extends PartProps<"button", FindingListItemState> {
  finding: ListedFinding;
}

/** A finding to pick: its message by default. Renders a `<button>`. */
export function FindingListItem(props: FindingListItemProps): React.ReactElement {
  const { finding: f, children, ...rest } = props;
  const ctx = useContext(FindingListContext);
  if (!ctx) throw new Error("earshot: <FindingList.Item> must be inside <FindingList.Root>.");
  const { clock, selection } = usePlayer("FindingList.Item");
  const selected = useSelected(selection, "findingId", f.id);
  return usePart(
    "finding-list-item",
    "button",
    { type: f.type, severity: f.severity, selected },
    rest as PartProps<"button", FindingListItemState>,
    {
      type: "button",
      tabIndex: ctx.tabStop === f.id ? 0 : -1,
      ...(selected && { "aria-current": "true" }),
      onFocus: () => ctx.focused(f.id),
      onClick: () =>
        applyMoment(
          { clock, selection },
          momentFor({ start: f.start, finding: f.id, ...(f.turnId && { turn: f.turnId }) }, ctx.leadIn),
        ),
      children: children ?? f.message,
    },
  );
}
