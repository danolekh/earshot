/* The conversation model, framework-free: build one, ask it what's said when, stream a live one,
 * and keep time. */
export type {
  Conversation,
  ConversationEvent,
  ConversationInput,
  EventInput,
  HandoffEvent,
  IntentEvent,
  LatencyEvent,
  NoteEvent,
  Peaks,
  Role,
  ToolCallEvent,
  Turn,
  TurnInput,
  VerdictEvent,
  Word,
} from "./types";
export {
  createConversation,
  eventsIn,
  formatTime,
  gaps,
  isSpoken,
  measureLatency,
  nextTurn,
  overlaps,
  peaksFor,
  prevTurn,
  spokenUntil,
  stepWord,
  turnAt,
  wordAt,
} from "./conversation";
export { createLiveConversation, type LiveConversation } from "./live";
export { createVirtualClock, type Clock, type VirtualClockEnv } from "./clock";
export { computePeaks, fromAudiowaveform, peakBetween, peaksFromWords } from "./peaks";
export {
  buildPyramid,
  computeMinMax,
  decodePeakLevel,
  encodePeakLevel,
  levelFor,
  minMaxBetween,
  peaksFromLevel,
  pyramidFromPeaks,
  type EncodedPeakLevel,
  type PeakLevel,
  type PeakPyramid,
} from "./pyramid";
