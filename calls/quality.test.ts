import { describe, expect, it } from "vitest";

import { checkAlignment } from "./quality.ts";
import { refineToSpeech } from "./timing.ts";

// The consent line as the committed trace had it: speech on the recording, and whisper's words.
const speech = [
  { start: 7.96, end: 8.13 },
  { start: 8.435, end: 8.79 },
  { start: 9.0, end: 9.565 },
];
const w = (text: string, start: number, end: number) => ({ text, start, end });

describe("the alignment gate", () => {
  it("fails whisper's timings for 'Ja, das ist in Ordnung.'", () => {
    const { flags, coverage } = checkAlignment(
      [
        w("Ja,", 7.958, 8.428),
        w("das", 8.428, 8.458),
        w("ist", 8.458, 8.698),
        w("in", 8.698, 8.998),
        w("Ordnung.", 8.998, 9.648),
      ],
      speech,
    );
    expect(coverage).toBeLessThan(0.85);
    expect(flags.some((f) => f.startsWith('pause in "Ja,"'))).toBe(true);
    expect(flags.some((f) => f.startsWith('short "das"'))).toBe(true);
  });

  it("still fails them after they're fitted to the speech: fitting only trims edges", () => {
    const refined = refineToSpeech(
      [
        w("Ja,", 7.958, 8.428),
        w("das", 8.428, 8.458),
        w("ist", 8.458, 8.698),
        w("in", 8.698, 8.998),
        w("Ordnung.", 8.998, 9.648),
      ],
      speech,
    );
    expect(checkAlignment(refined, speech).flags).not.toEqual([]);
  });

  it("passes words that sit on the speech", () => {
    const { flags } = checkAlignment(
      [
        w("Ja,", 7.96, 8.13),
        w("das", 8.44, 8.6),
        w("ist", 8.6, 8.79),
        w("in", 9.0, 9.12),
        w("Ordnung.", 9.12, 9.56),
      ],
      speech,
    );
    expect(flags).toEqual([]);
  });
});
