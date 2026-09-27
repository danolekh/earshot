/* OpenAI: Whisper's `verbose_json` with `timestamp_granularities: ["word"]` (one speaker, so one
 * turn), and the Realtime API's truncation, which says how much of an agent reply was heard. */

import type { Role, TurnInput } from "../core/types";

export interface OpenAIVerboseTranscription {
  text: string;
  duration?: number;
  words?: readonly { word: string; start: number; end: number }[];
}

/** One turn from a Whisper transcription, shifted by `offset` seconds (where this audio starts in
 * the call). */
export function fromOpenAITranscription(
  json: OpenAIVerboseTranscription,
  options: { role?: Role; offset?: number } = {},
): TurnInput {
  const offset = options.offset ?? 0;
  const words = (json.words ?? []).map((w) => ({
    text: w.word,
    start: w.start + offset,
    end: w.end + offset,
  }));
  return {
    role: options.role ?? "user",
    words,
    text: json.text.trim(),
    ...(words.length === 0 && { start: offset, end: offset + (json.duration ?? 0) }),
  };
}

/** Where a Realtime `conversation.item.truncate` (`audio_end_ms`) cut an agent turn that started
 * at `turnStart` seconds: its `interruptedAt`. */
export const realtimeTruncation = (event: { audio_end_ms: number }, turnStart: number): number =>
  turnStart + event.audio_end_ms / 1000;
