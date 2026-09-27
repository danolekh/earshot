/* The call debugger's model: one call on one clock. Where a `Conversation` says what was said, a
 * `CallTrace` says why it went the way it did: the pipeline's spans, the turn-taking decisions,
 * what the agent heard next to what was said, and what the detectors found. Times are seconds
 * from the start of the recording, like everywhere in earshot; `clock.t0UnixMs` anchors them to
 * wall-clock time, which is how spans from a tracing backend line up with the audio. Plain JSON
 * (schema: earshot/schema/call-trace.v1.json). */

import type { EncodedPeakLevel } from "../core/pyramid";

/** Which side of the call: the person on the phone, or the agent. A stereo recording carries one
 * per channel (LiveKit and Pipecat: caller left, agent right). */
export type Channel = "caller" | "agent";

/** What an audio channel carries: one side, or both mixed (a mono recording, as ElevenLabs
 * Agents keeps). */
export type AudioChannel = Channel | "mixed";

export interface Interval {
  start: number;
  end: number;
}

/** A span or event attribute, as OpenTelemetry carries it. */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly AttributeValue[]
  | { readonly [key: string]: AttributeValue };

export type Attributes = Readonly<Record<string, AttributeValue>>;

export interface CallMeta {
  id: string;
  /** Seconds. */
  duration: number;
  title?: string;
  direction?: "inbound" | "outbound";
  /** BCP 47, e.g. "de-DE". */
  language?: string;
  /** ISO 8601. */
  startedAt?: string;
  /** Whatever the call was meant to achieve, as the outcome extractor saw it. */
  outcome?: Readonly<Record<string, unknown>>;
  /** Recording consent, where the law asks for it before anything is stored. */
  consent?: "pending" | "granted" | "declined" | "withdrawn" | "not_required";
  /** What was running: agent, prompt, sdk and so on. */
  versions?: Readonly<Record<string, string>>;
  /** Made by a script rather than recorded. */
  synthetic?: boolean;
  /** The stack that recorded it: "livekit", "pipecat", "elevenlabs"... */
  provider?: string;
}

export interface TraceClock {
  /** Wall-clock time (Unix ms) of the recording's first sample; spans subtract it. */
  t0UnixMs: number;
  sampleRate?: number;
  /** What each audio channel carries, in order. */
  channels: readonly AudioChannel[];
  /** How far (seconds) audio and span times may disagree; markers are drawn with this slack. */
  tolerance?: number;
  /** A measured offset (seconds) between the server's audio and what the caller heard on the
   * phone network, when known. */
  pstnOffset?: number;
}

export interface TraceAudio {
  /** The recording, best format first (Ogg Opus, then MP3). */
  sources: readonly { src: string; type: string }[];
  /** The finest waveform level per channel; coarser ones are built on load. */
  peaks?: Readonly<Partial<Record<AudioChannel, EncodedPeakLevel>>>;
}

/** What produced a turn, for comparing a good call with a bad one. */
export interface TurnContext {
  promptVersion?: string;
  model?: string;
  stt?: string;
  tts?: string;
  turnDetector?: string;
  interruptionMode?: string;
  [key: string]: string | undefined;
}

/** A turn's latency as the pipeline reported it, and as measured on the recording. Seconds. */
export interface TurnLatency {
  /** From the end of the caller's speech to the agent's first sound, on the waveform. */
  waveformGap?: number;
  /** The pipeline's own end-to-end figure (LiveKit `lk.e2e_latency`). */
  e2e?: number;
  endOfTurn?: number;
  transcription?: number;
  llmTtft?: number;
  tool?: number;
  ttsTtfb?: number;
}

export interface TraceTurn {
  id: string;
  channel: Channel;
  start: number;
  end: number;
  text: string;
  /** The recogniser's confidence for the whole turn, 0..1, when it gave one. */
  confidence?: number;
  /** LiveKit's `lk.speech_id`: joins an agent turn to its spans. */
  speechId?: string;
  /** For an agent turn: the caller turn it answers. */
  replyTo?: string;
  /** For an agent turn that was cut off: when, and the last text the caller heard. */
  interrupted?: { at: number; heardUntil?: number; heardText?: string };
  latency?: TurnLatency;
  context?: TurnContext;
  /** Its edges are guessed (the source gave no measured start or end), not measured. */
  estimated?: boolean;
}

export type SpanKind =
  | "session"
  | "user_turn"
  | "eou"
  | "stt"
  | "agent_turn"
  | "llm"
  | "tool"
  | "tts"
  | "playout"
  | "other";

export interface SpanStatus {
  code: "unset" | "ok" | "error";
  message?: string;
}

export interface SpanEvent {
  name: string;
  at: number;
  attributes?: Attributes;
}

export interface ToolInvocation {
  name: string;
  callId?: string;
  arguments?: unknown;
  result?: unknown;
  isError?: boolean;
}

/** One unit of work in the agent's pipeline, from a tracing backend (OpenTelemetry). */
export interface TraceSpan {
  id: string;
  traceId?: string;
  parentId?: string;
  /** As emitted (`llm_request`, `function_tool`...). */
  name: string;
  /** What it is, whatever the framework called it. */
  kind: SpanKind;
  start: number;
  end: number;
  turnId?: string;
  /** The process that emitted it; spans from other hosts may be clock-skewed. */
  process?: string;
  status?: SpanStatus;
  tool?: ToolInvocation;
  attributes: Attributes;
  events?: readonly SpanEvent[];
  /** When its first token or byte arrived (seconds, on the call's clock), for a model or speech
   * request that streams. */
  firstChunk?: number;
  /** For a model request: which model, what it was given and what it said. */
  llm?: LlmCall;
  /** Worked out rather than traced (a tool call found only in the next request's input). */
  estimated?: boolean;
}

/** One message of a model's input, whatever the provider's format. */
export interface ChatMessage {
  role: string;
  content: string;
  /** For an assistant message: the tools it asked for. */
  toolCalls?: readonly { id?: string; name: string; arguments?: unknown }[];
  /** For a tool message: the call it answers. */
  toolCallId?: string;
}

/** A model request, normalized: the model, its input messages, and its output (text, or the
 * tools it asked for). */
export interface LlmCall {
  model?: string;
  messages?: readonly ChatMessage[];
  output?: string;
  toolCalls?: readonly { id?: string; name: string; arguments?: unknown }[];
}

export type SignalType =
  | "vad_speech"
  | "eou_decision"
  | "interruption"
  | "false_interruption"
  | "backchannel"
  | "agent_state"
  | "user_state"
  | "playback_started"
  | "playback_stopped"
  | "consent"
  | "disclosure"
  | "dtmf"
  | "transfer"
  | "amd_verdict"
  | "error";

interface SignalBase {
  id: string;
  at: number;
  /** For a signal that lasts (speech detected, a state). */
  end?: number;
  channel?: Channel;
  turnId?: string;
}

/** The turn detector deciding whether the caller has finished. */
export interface EouDecisionSignal extends SignalBase {
  type: "eou_decision";
  data: {
    /** The model's end-of-turn probability, 0..1, when a model decided. */
    probability?: number;
    /** How long it waited after the caller's last sound, seconds. */
    wait: number;
    /** `committed`: the turn ended; `user_resumed`: the caller went on; `dropped`: abandoned. */
    outcome: "committed" | "user_resumed" | "dropped";
    threshold?: number;
  };
}

/** The caller talking over the agent, and what the agent did about it. */
export interface InterruptionSignal extends SignalBase {
  type: "interruption";
  data: {
    decision: "stop" | "continue" | "resume";
    reason?: string;
    /** Seconds from the caller's first sound to the agent's audio stopping. */
    stopAfter?: number;
    /** The agent's text the caller had heard when it stopped. */
    heardText?: string;
  };
}

export interface GenericSignal extends SignalBase {
  type: Exclude<SignalType, "eou_decision" | "interruption">;
  data?: Readonly<Record<string, unknown>>;
}

/** Something the pipeline decided or detected at a moment, as opposed to work it did (a span). */
export type TraceSignal = EouDecisionSignal | InterruptionSignal | GenericSignal;

/** `streaming_asr`: what the agent heard, live. `aligned`: what was said, aligned to the
 * recording afterwards. `tts`: what the agent generated to say. */
export type WordSource = "streaming_asr" | "aligned" | "tts";

export interface TraceWord {
  id: string;
  channel: Channel;
  source: WordSource;
  text: string;
  start: number;
  end: number;
  /** 0..1, as the recogniser reported it; not comparable across vendors. */
  confidence?: number;
  turnId?: string;
  /** For agent words: false when the agent was cut off before saying it. */
  heard?: boolean;
  /** A slot the word belongs to (`customer_id`, `iban`...); mismatches there matter most. */
  entity?: string;
  redacted?: boolean;
  /** Timings spread over the turn, not measured. */
  estimated?: boolean;
}

export type FindingType =
  | "slow_turn"
  | "dead_air"
  | "talk_over"
  | "agent_did_not_stop"
  | "false_interruption"
  | "early_endpoint"
  | "low_asr_confidence"
  | "heard_vs_said"
  | "tool_error"
  | "slow_tool"
  | "repeat"
  | "disclosure_missing"
  | "human_feedback";

export type Severity = "info" | "warning" | "error";

/** Something a detector (or a person) flagged, with the evidence it rests on. */
export interface Finding {
  /** Stable across rebuilds (`type:turnId`), so a link to it keeps working. */
  id: string;
  type: FindingType;
  start: number;
  end: number;
  severity: Severity;
  turnId?: string;
  detector: { id: string; version: number };
  message: string;
  /** Ids of the spans, signals, words and turns it rests on. */
  evidence: readonly string[];
  /** What was measured, next to the threshold it crossed (`{ gap: 3.1, threshold: 1.5 }`). */
  measured?: Readonly<Record<string, number>>;
}

export interface CallTrace {
  version: 1;
  call: CallMeta;
  clock: TraceClock;
  audio?: TraceAudio;
  turns: readonly TraceTurn[];
  spans: readonly TraceSpan[];
  signals: readonly TraceSignal[];
  words: readonly TraceWord[];
  /** Where each channel has speech, from the recording (voice activity). A mono recording has it
   * on `mixed`; `measuredSpeech` says which side each stretch was. */
  speech?: Readonly<Partial<Record<AudioChannel, readonly Interval[]>>>;
  findings: readonly Finding[];
}

/** An item before it has an id; distributes over unions, so a signal keeps its `type`/`data` pair. */
export type WithoutId<T> = T extends unknown ? Omit<T, "id"> & { id?: string } : never;

/** What a caller hands in: ids may be left out, the lists may be missing or unsorted, and the
 * text of a turn is built from its words. */
export interface CallTraceInput {
  version?: 1;
  call: Omit<CallMeta, "duration"> & { duration?: number };
  clock: TraceClock;
  audio?: TraceAudio;
  turns: readonly (Omit<TraceTurn, "id" | "text"> & { id?: string; text?: string })[];
  spans?: readonly WithoutId<TraceSpan>[];
  signals?: readonly WithoutId<TraceSignal>[];
  words?: readonly WithoutId<TraceWord>[];
  speech?: CallTrace["speech"];
  findings?: readonly Finding[];
}
