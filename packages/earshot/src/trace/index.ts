/* The call debugger's model, framework-free: a call on one clock with its spans, turn-taking
 * decisions, word tiers and findings; where each reply's wait went; what the agent heard against
 * what was said; and the detectors that flag a bad moment. */
export type {
  Attributes,
  AttributeValue,
  AudioChannel,
  CallMeta,
  CallTrace,
  CallTraceInput,
  Channel,
  ChatMessage,
  EouDecisionSignal,
  Finding,
  FindingType,
  GenericSignal,
  InterruptionSignal,
  Interval,
  LlmCall,
  Severity,
  SignalType,
  SpanEvent,
  SpanKind,
  SpanStatus,
  ToolInvocation,
  TraceAudio,
  TraceClock,
  TraceSignal,
  TraceSpan,
  TraceTurn,
  TraceWord,
  TurnContext,
  TurnLatency,
  WithoutId,
  WordSource,
} from "./types";
export {
  childrenOf,
  createTrace,
  decisionsOf,
  replyOf,
  signalsIn,
  spanById,
  spansOf,
  toConversation,
  toolsOf,
  turnById,
  wordsOf,
} from "./trace";
export {
  coverage,
  latencyBreakdown,
  latencyRows,
  speechEnd,
  UNEXPLAINED_MIN,
  type LatencyBreakdown,
  type LatencyRow,
  type LatencyRowKind,
  type LatencyStage,
  type LatencyStageKind,
} from "./latency";
export {
  diffTokens,
  diffWords,
  heardDiff,
  missedSaid,
  normalizeToken,
  type DiffOp,
  type HeardDiff,
  type WordDiff,
} from "./diff";
export { describeSignal, TURN_TAKING_SIGNALS } from "./signals";
export { contextGist, decisionsGist, heardGist, latencyGist, modelGist, toolsGist } from "./gists";
export { turnEvidence, type EvidencePart, type TurnEvidence } from "./evidence";
export { mergeAnalysis, speechFromPeaks, type SpeechOptions } from "./analysis";
export { measuredSpeech } from "./speech";
export {
  DEFAULT_DETECTOR_CONFIG,
  blindSpots,
  DETECTORS,
  detect,
  runDetectors,
  type DetectOptions,
  type Detector,
  type DetectorConfig,
} from "./detectors";
export { sentences, similarity } from "./similarity";
export {
  ANCHOR_MATCH,
  anchorMatches,
  anchorScore,
  findAnchor,
  runChecks,
  runTestCase,
  saidText,
  type Anchor,
  type Check,
  type CheckResult,
  type CheckScope,
  type HearsCheck,
  type NoFindingCheck,
  type ReplyWithinCheck,
  type ToolSucceedsCheck,
  type CheckStatus,
  type TestCase,
} from "./checks";
export { isNumberWord } from "./detectors/util";
export { anchorFor, checkFor, describeCheck, draftTestCase, summarizeRun, type RunSummary } from "./draft";
export {
  countBySeverity,
  EVIDENCE_FOR,
  FINDING_META,
  findingLabel,
  findingShort,
  groupFindings,
  measuredText,
  worstSeverity,
  type EvidenceKind,
  type FindingCategory,
  type FindingMeta,
} from "./findings";
export { modelInput, type ModelInput } from "./model-input";
