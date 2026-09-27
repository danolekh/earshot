/* Vendor transcripts in, one conversation out; and whole calls in from any stack, as layers of one
 * trace (read.ts). Each normaliser is its own module, so an app pays only for the ones it
 * imports. */
export { roleResolver, type RoleMap } from "./roles";
export { fromDeepgram, type DeepgramResponse } from "./deepgram";
export { fromAssemblyAI, type AssemblyAITranscript } from "./assemblyai";
export { fromOpenAITranscription, realtimeTruncation, type OpenAIVerboseTranscription } from "./openai";
export { wordsFromAlignment, type ElevenLabsAlignment } from "./elevenlabs";
export { fromRetell, type RetellCall } from "./retell";
export { fromCaptions, spreadWords, toSRT, toWebVTT } from "./vtt";
export {
  anyValue as otlpValue,
  attributes as otlpAttributes,
  readOtlpSpans,
  secondsSince,
  type OtlpAnyValue,
  type OtlpKeyValue,
  type OtlpSpan,
  type OtlpSpanJson,
  type OtlpTraces,
} from "./otlp";
export {
  CLOCK_RANKS,
  clockStart,
  mergeParts,
  readCall,
  readContext,
  type ClockAnchor,
  type ClockRank,
  type CallPart,
  type FindingDraft,
  type MergedCall,
  type ReadContext,
  type SignalDraft,
  type Source,
  type SpanDraft,
  type TurnDraft,
  type TurnEdge,
  type WordDraft,
} from "./read";
export { callMeta, recording, timedWords, type RecordingInput } from "./sources";
export { normalizeChat } from "./chat";
export { py, toLiveKitTest } from "./livekit-test";
export {
  fromPipecat,
  pipecat,
  PIPECAT_SPAN_KINDS,
  type PipecatEvent,
  type PipecatFunctionCallEvent,
  type PipecatInput,
  type PipecatRecordingEvent,
  type PipecatSpeechEvent,
} from "./pipecat";
export { timedTurns, type TimedMessage } from "./timed";
export { detectFormat, type ExportKind, parseExport, readExports, type ReadExports } from "./detect";
export {
  elevenLabsAgents,
  fromElevenLabsAgents,
  type ElevenLabsConversation,
  type ElevenLabsInput,
  type ElevenLabsMessage,
} from "./elevenlabs-agents";
export {
  compactLatency,
  jsonValue,
  numberValue,
  spanTree,
  stringValue,
  toSpanDraft,
  type SpanTree,
} from "./otel";
export {
  fromLiveKit,
  livekit,
  LIVEKIT_SPAN_KINDS,
  type LiveKitInput,
  type LiveKitSessionReport,
} from "./livekit";
