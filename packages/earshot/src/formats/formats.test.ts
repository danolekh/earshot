import { describe, expect, it } from "vitest";

import { fromAssemblyAI } from "./assemblyai";
import { fromDeepgram } from "./deepgram";
import { wordsFromAlignment } from "./elevenlabs";
import { fromOpenAITranscription, realtimeTruncation } from "./openai";
import { fromRetell } from "./retell";
import { fromCaptions, toSRT, toWebVTT } from "./vtt";

describe("Deepgram", () => {
  const words = [
    { word: "hello", punctuated_word: "Hello,", start: 0.08, end: 0.4, confidence: 0.99, speaker: 0 },
    { word: "thanks", punctuated_word: "thanks", start: 0.45, end: 0.8, confidence: 0.97, speaker: 0 },
    { word: "hi", punctuated_word: "Hi.", start: 1.2, end: 1.4, confidence: 0.95, speaker: 1 },
  ];

  it("makes a turn per utterance, first speaker as the agent", () => {
    const c = fromDeepgram({
      results: {
        channels: [{ alternatives: [{ words }] }],
        utterances: [
          { start: 0.08, end: 0.8, transcript: "Hello, thanks", speaker: 0, words: words.slice(0, 2) },
          { start: 1.2, end: 1.4, transcript: "Hi.", speaker: 1, words: words.slice(2) },
        ],
      },
    });
    expect(c.turns.map((t) => [t.role, t.text])).toEqual([
      ["agent", "Hello, thanks"],
      ["user", "Hi."],
    ]);
    expect(c.turns[0]!.words[0]).toEqual({ text: "Hello,", start: 0.08, end: 0.4, confidence: 0.99 });
  });

  it("groups diarized words into turns without utterances, with a role map", () => {
    const c = fromDeepgram(
      { results: { channels: [{ alternatives: [{ words }] }] } },
      { roles: { "0": "user", "1": "agent" } },
    );
    expect(c.turns.map((t) => [t.role, t.words.length])).toEqual([
      ["user", 2],
      ["agent", 1],
    ]);
  });
});

describe("AssemblyAI", () => {
  it("converts milliseconds and speaker labels", () => {
    const c = fromAssemblyAI({
      utterances: [
        {
          speaker: "A",
          start: 250,
          end: 900,
          text: "Good morning.",
          words: [
            { text: "Good", start: 250, end: 500, confidence: 0.9 },
            { text: "morning.", start: 520, end: 900 },
          ],
        },
        {
          speaker: "B",
          start: 1500,
          end: 1800,
          text: "Morning!",
          words: [{ text: "Morning!", start: 1500, end: 1800 }],
        },
      ],
    });
    expect(c.turns[0]).toMatchObject({ role: "agent", start: 0.25, end: 0.9, text: "Good morning." });
    expect(c.turns[1]).toMatchObject({ role: "user", start: 1.5 });
  });
});

describe("OpenAI", () => {
  it("shifts Whisper word timestamps into the call", () => {
    const turn = fromOpenAITranscription(
      {
        text: " Where is my order? ",
        words: [
          { word: "Where", start: 0, end: 0.3 },
          { word: "order", start: 0.6, end: 1 },
        ],
      },
      { offset: 10 },
    );
    expect(turn).toMatchObject({
      role: "user",
      text: "Where is my order?",
      words: [{ start: 10 }, { start: 10.6, end: 11 }],
    });
  });

  it("turns a Realtime truncation into the moment the agent was cut off", () => {
    expect(realtimeTruncation({ audio_end_ms: 1500 }, 4)).toBe(5.5);
  });
});

describe("ElevenLabs", () => {
  it("groups character timings into words", () => {
    const text = "Hi, Anna.";
    const chars = [...text];
    const words = wordsFromAlignment(
      {
        characters: chars,
        character_start_times_seconds: chars.map((_, i) => i * 0.1),
        character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1),
      },
      2,
    );
    expect(words.map((w) => w.text)).toEqual(["Hi,", "Anna."]);
    expect(words[1]!.start).toBeCloseTo(2.4);
    expect(words[1]!.end).toBeCloseTo(2.9);
  });
});

describe("Retell", () => {
  it("reads transcript_object turns", () => {
    const c = fromRetell({
      call_id: "call_1",
      duration_ms: 5000,
      transcript_object: [
        {
          role: "agent",
          content: "Hello there",
          words: [
            { word: "Hello ", start: 0, end: 0.4 },
            { word: "there", start: 0.4, end: 0.8 },
          ],
        },
        { role: "user", content: "Hi", words: [{ word: "Hi", start: 1, end: 1.2 }] },
      ],
    });
    expect(c).toMatchObject({ id: "call_1", duration: 5 });
    expect(c.turns[0]!.words[0]!.text).toBe("Hello");
  });
});

describe("captions", () => {
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.500
<v Agent>Hello, how can I help?

00:00:02.000 --> 00:00:03.000
<v Caller>Where is my order?
`;

  it("reads WebVTT voices, and spreads words over each cue", () => {
    const c = fromCaptions(vtt, { roles: { Agent: "agent", Caller: "user" } });
    expect(c.turns.map((t) => [t.role, t.speaker, t.text])).toEqual([
      ["agent", "Agent", "Hello, how can I help?"],
      ["user", "Caller", "Where is my order?"],
    ]);
    const words = c.turns[1]!.words;
    expect(words[0]!.start).toBe(2);
    expect(words.at(-1)!.end).toBeLessThanOrEqual(3);
  });

  it("round-trips through WebVTT and SRT", () => {
    const c = fromCaptions(vtt);
    expect(toWebVTT(c)).toBe(vtt.replace("\n<v", "\n<v"));
    const srt = toSRT(c);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nAgent: Hello, how can I help?");
    expect(fromCaptions(srt).turns.map((t) => t.speaker)).toEqual(["Agent", "Caller"]);
  });
});
