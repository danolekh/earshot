/* ElevenLabs text-to-speech with timestamps (`/with-timestamps`, and the Agents platform's audio
 * alignment): character timings as parallel arrays, grouped here into words. */

import type { Word } from "../core/types";

export interface ElevenLabsAlignment {
  characters: readonly string[];
  character_start_times_seconds: readonly number[];
  character_end_times_seconds: readonly number[];
}

/** Words from character timings, shifted by `offset` seconds. Whitespace separates words;
 * punctuation stays with the word it follows. */
export function wordsFromAlignment(alignment: ElevenLabsAlignment, offset = 0): Word[] {
  const words: Word[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (text) words.push({ text, start: start + offset, end: end + offset });
    text = "";
  };
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) return flush();
    if (!text) start = alignment.character_start_times_seconds[i] ?? end;
    text += ch;
    end = alignment.character_end_times_seconds[i] ?? start;
  });
  flush();
  return words;
}
