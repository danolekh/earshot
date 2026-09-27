"use client";
/* The turn detector's decisions on a caller turn, in order: each `data-outcome` (committed,
 * user_resumed, dropped) with `--eou-probability`, said as the timeline says it. */
import type * as React from "react";

import { formatTime } from "../core/conversation";
import { describeSignal } from "../trace/signals";
import type { EouDecisionSignal } from "../trace/types";
import { type PartProps, usePart } from "../utils/part";

export interface DecisionsRootProps extends Omit<PartProps<"ol", Record<string, never>>, "children"> {
  /** From `decisionsOf`. */
  decisions: readonly EouDecisionSignal[];
  /** Each decision; a `Decisions.Item` by default. */
  children?: (decision: EouDecisionSignal) => React.ReactNode;
}

/** A caller turn's end-of-turn decisions. Renders an `<ol>`. */
export function DecisionsRoot(props: DecisionsRootProps): React.ReactElement {
  const { decisions, children, ...rest } = props;
  return usePart("decisions", "ol", {}, rest as PartProps<"ol", Record<string, never>>, {
    children: decisions.map((d) => (children ? children(d) : <DecisionsItem key={d.id} decision={d} />)),
  });
}

export interface DecisionsItemState extends Record<string, unknown> {
  outcome: EouDecisionSignal["data"]["outcome"];
}

export interface DecisionsItemProps extends PartProps<"li", DecisionsItemState> {
  decision: EouDecisionSignal;
}

/** One decision: "0:16 · End of turn committed after 350 ms, p = 0.91", unless you give children.
 * Renders an `<li>`. */
export function DecisionsItem(props: DecisionsItemProps): React.ReactElement {
  const { decision: d, children, ...rest } = props;
  return usePart(
    "decisions-item",
    "li",
    { outcome: d.data.outcome },
    rest as PartProps<"li", DecisionsItemState>,
    {
      ...(d.data.probability !== undefined && {
        style: { "--eou-probability": d.data.probability } as React.CSSProperties,
      }),
      children: children ?? `${formatTime(d.at)} · ${describeSignal(d)}`,
    },
  );
}
