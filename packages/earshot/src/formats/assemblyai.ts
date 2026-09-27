/* AssemblyAI's transcript (`GET /v2/transcript/:id`): times in milliseconds. With speaker labels
 * each utterance is a turn; without, the whole transcript is one. */

import { createConversation } from "../core/conversation";
import type { Conversation, Word } from "../core/types";
import { type RoleMap, roleResolver } from "./roles";

interface AssemblyWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string | null;
}

export interface AssemblyAITranscript {
  text?: string | null;
  words?: readonly AssemblyWord[] | null;
  utterances?:
    | readonly { speaker: string; start: number; end: number; text: string; words: readonly AssemblyWord[] }[]
    | null;
}

const word = (w: AssemblyWord): Word => ({
  text: w.text,
  start: w.start / 1000,
  end: w.end / 1000,
  ...(w.confidence !== undefined && { confidence: w.confidence }),
});

export function fromAssemblyAI(
  transcript: AssemblyAITranscript,
  options: { roles?: RoleMap } = {},
): Conversation {
  const role = roleResolver(options.roles);
  if (transcript.utterances?.length)
    return createConversation({
      turns: transcript.utterances.map((u) => ({
        role: role(u.speaker),
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
        words: u.words.map(word),
      })),
    });
  const words = (transcript.words ?? []).map(word);
  return createConversation({
    turns: words.length
      ? [{ role: role(undefined), words, ...(transcript.text && { text: transcript.text }) }]
      : [],
  });
}
