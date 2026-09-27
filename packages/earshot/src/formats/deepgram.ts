/* Deepgram's pre-recorded response (`/v1/listen`): times in seconds. With `utterances=true` each
 * utterance is a turn; otherwise consecutive words by the same speaker (`diarize=true`) or channel
 * (`multichannel=true`) are. */

import { createConversation } from "../core/conversation";
import type { Conversation, TurnInput, Word } from "../core/types";
import { type RoleMap, roleResolver } from "./roles";

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number;
}

export interface DeepgramResponse {
  results: {
    channels: readonly { alternatives: readonly { words?: readonly DeepgramWord[] }[] }[];
    utterances?: readonly {
      start: number;
      end: number;
      transcript: string;
      channel?: number;
      speaker?: number;
      words: readonly DeepgramWord[];
    }[];
  };
}

const word = (w: DeepgramWord): Word => ({
  text: w.punctuated_word ?? w.word,
  start: w.start,
  end: w.end,
  ...(w.confidence !== undefined && { confidence: w.confidence }),
});

export function fromDeepgram(response: DeepgramResponse, options: { roles?: RoleMap } = {}): Conversation {
  const role = roleResolver(options.roles);
  const utterances = response.results.utterances;
  if (utterances?.length) {
    return createConversation({
      turns: utterances.map((u) => ({
        role: role(u.speaker ?? u.channel),
        start: u.start,
        end: u.end,
        text: u.transcript,
        words: u.words.map(word),
      })),
    });
  }
  const turns: TurnInput[] = [];
  response.results.channels.forEach((channel, c) => {
    let key: string | undefined;
    let words: Word[] = [];
    for (const w of channel.alternatives[0]?.words ?? []) {
      const next = response.results.channels.length > 1 ? String(c) : String(w.speaker ?? 0);
      if (next !== key) {
        key = next;
        words = [];
        turns.push({ role: role(key), words });
      }
      words.push(word(w));
    }
  });
  return createConversation({ turns });
}
