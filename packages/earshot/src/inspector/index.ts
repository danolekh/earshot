/* What explains a moment of a call, as headless parts: where a reply's wait went, what was heard
 * against what was said, the turn detector's decisions, tool calls, the model's input, and the
 * findings to pick from. They take what `@danolekh/earshot/trace` works out (`latencyBreakdown`,
 * `heardDiff`, `decisionsOf`, `toolsOf`, `modelInput`); `turnEvidence` says which to show. */
export * as Latency from "./latency.parts";
export * as HeardVsSaid from "./heard-vs-said.parts";
export * as Decisions from "./decisions.parts";
export * as ToolCall from "./tool-call.parts";
export * as Prompt from "./prompt.parts";
export * as FindingList from "./finding-list.parts";
export type {
  LatencyBarProps,
  LatencyCaptionProps,
  LatencyRootProps,
  LatencyRootState,
  LatencyRowState,
  LatencySegmentProps,
  LatencyStageProps,
  LatencyStagesProps,
} from "./latency";
export type {
  HeardSource,
  HeardVsSaidRootProps,
  HeardVsSaidRootState,
  HeardVsSaidWordProps,
  HeardVsSaidWordsProps,
  HeardVsSaidWordState,
} from "./heard-vs-said";
export type { DecisionsItemProps, DecisionsItemState, DecisionsRootProps } from "./decisions";
export type {
  ToolCallFieldsProps,
  ToolCallFieldsState,
  ToolCallRootProps,
  ToolCallRootState,
} from "./tool-call";
export type { PromptMessageProps, PromptMessageState, PromptRootProps } from "./prompt";
export type {
  FindingListItemProps,
  FindingListItemState,
  FindingListRootProps,
  ListedFinding,
} from "./finding-list";
