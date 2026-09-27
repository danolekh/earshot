/* The stacks a call can come from, by name, and what each keeps of a call. */
import type { CallTrace } from "@danolekh/earshot/trace";

export const STACK_NAMES: Readonly<Record<string, string>> = {
  livekit: "LiveKit",
  pipecat: "Pipecat",
  elevenlabs: "ElevenLabs",
};

/** A stack's name, as people write it. */
export const stackName = (provider: string | undefined): string =>
  provider === undefined ? "Unknown stack" : (STACK_NAMES[provider] ?? provider);

/** What a stack keeps of a call, in a line, for where it came from. */
export const STACK_KEEPS: Readonly<Record<string, string>> = {
  livekit: "OpenTelemetry spans and the session report; a stereo recording",
  pipecat: "OpenTelemetry spans and its observers' events; a stereo recording",
  elevenlabs: "A transcript timed to the second, with tool calls; one mixed recording",
};

export const providerOf = (trace: CallTrace): string | undefined => trace.call.provider;
