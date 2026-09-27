"use client";
/* What the agent heard against what was said, word for word: a line of what was said and a line
 * of what was heard, each word `data-op` (same, changed, extra, missing) and `data-low` when the
 * recogniser was unsure. A word said but not heard leaves a gap in the heard line that screen
 * readers read as "not heard". */
import type * as React from "react";
import { createContext, useContext } from "react";

import { DEFAULT_DETECTOR_CONFIG } from "../trace/detectors/config";
import type { HeardDiff, WordDiff } from "../trace/diff";
import { type PartProps, usePart } from "../utils/part";
import { VISUALLY_HIDDEN } from "../utils/visually-hidden";

interface HeardContextValue {
  diff: HeardDiff;
  below: number;
}

const HeardContext = createContext<HeardContextValue | null>(null);

function useHeard(part: string): HeardContextValue {
  const ctx = useContext(HeardContext);
  if (!ctx) throw new Error(`earshot: <${part}> must be inside <HeardVsSaid.Root>.`);
  return ctx;
}

export type HeardSource = "said" | "heard";

export interface HeardVsSaidRootState extends Record<string, unknown> {
  /** Some word said wasn't heard as said. */
  missed: boolean;
  /** Some word was heard with low confidence. */
  unsure: boolean;
}

export interface HeardVsSaidRootProps extends PartProps<"div", HeardVsSaidRootState> {
  /** A caller turn's words, from `heardDiff`. */
  diff: HeardDiff;
  /** Confidence under this is unsure; the low-confidence detector's limit by default. */
  below?: number;
}

/** A caller turn heard against said. Put two `HeardVsSaid.Words` inside. Renders a `<div>`. */
export function HeardVsSaidRoot(props: HeardVsSaidRootProps): React.ReactElement {
  const { diff, below = DEFAULT_DETECTOR_CONFIG.lowAsrConfidence.below, ...rest } = props;
  const missed = diff.ops.some((o) => o.op !== "same" && o.said);
  const unsure = diff.ops.some((o) => o.heard?.confidence !== undefined && o.heard.confidence < below);
  const element = usePart(
    "heard-vs-said",
    "div",
    { missed, unsure },
    rest as PartProps<"div", HeardVsSaidRootState>,
    {},
  );
  return <HeardContext.Provider value={{ diff, below }}>{element}</HeardContext.Provider>;
}

export interface HeardVsSaidWordsProps extends Omit<PartProps<"span", { source: HeardSource }>, "children"> {
  /** Which line: the words said, or the words heard (with gaps where one wasn't). */
  source: HeardSource;
  /** Each word; a `HeardVsSaid.Word` by default. */
  children?: (op: WordDiff, index: number) => React.ReactNode;
}

/** One line of words. Renders a `<span>`. */
export function HeardVsSaidWords(props: HeardVsSaidWordsProps): React.ReactElement {
  const { source, children, ...rest } = props;
  const { diff } = useHeard("HeardVsSaid.Words");
  // The said line has each word said; the heard line each word heard, and a gap for each one missed.
  const shown = diff.ops
    .map((op, i) => [op, i] as const)
    .filter(([op]) => (source === "said" ? op.said : true));
  return usePart(
    "heard-vs-said-words",
    "span",
    { source },
    rest as PartProps<"span", { source: HeardSource }>,
    {
      children: shown.map(([op, i]) =>
        children ? children(op, i) : <HeardVsSaidWord key={i} op={op} source={source} />,
      ),
    },
  );
}

export interface HeardVsSaidWordState extends Record<string, unknown> {
  op: WordDiff["op"];
  /** Heard with confidence under the limit. */
  low: boolean;
}

export interface HeardVsSaidWordProps extends PartProps<"span", HeardVsSaidWordState> {
  op: WordDiff;
  source: HeardSource;
}

/** A word as said, or as heard (`--word-confidence` 0..1 when the recogniser gave one). In the
 * heard line, a word said but not heard is a placeholder ("␣", `aria-hidden`) with "not heard" for
 * screen readers. Renders a `<span>`. */
export function HeardVsSaidWord(props: HeardVsSaidWordProps): React.ReactElement {
  const { op, source, children, ...rest } = props;
  const { below } = useHeard("HeardVsSaid.Word");
  const word = source === "said" ? op.said : op.heard;
  const confidence = source === "heard" ? op.heard?.confidence : undefined;
  const low = confidence !== undefined && confidence < below;
  return usePart(
    "heard-vs-said-word",
    "span",
    { op: op.op, low },
    rest as PartProps<"span", HeardVsSaidWordState>,
    {
      ...(confidence !== undefined && {
        title: `confidence ${confidence.toFixed(2)}`,
        style: { "--word-confidence": confidence } as React.CSSProperties,
      }),
      children:
        children ??
        (word ? (
          word.text
        ) : (
          <>
            <span aria-hidden>␣</span>
            <span style={VISUALLY_HIDDEN}>not heard</span>
          </>
        )),
    },
  );
}
