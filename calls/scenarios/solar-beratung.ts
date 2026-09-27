/* An outbound lead call for a solar installer. Invented company and person. Two things go wrong:
 *
 *   1. The agent never says it's an AI (EU AI Act, Art. 50): the greeting sounds like a person.
 *   2. Booking the appointment takes the calendar 2.4 s, and the caller hears three seconds of
 *      nothing before the confirmation. */
import type { Scenario } from "../scenario.ts";

export const solar: Scenario = {
  id: "solar-beratung",
  title: "Sonnenwerk Solar · Beratungstermin",
  lang: "de",
  language: "de-DE",
  direction: "outbound",
  startedAt: "2026-09-25T14:32:10Z",
  voices: {
    agent: { exaggeration: 0.5, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.5, cfg: 0.4, say: "Markus (Premium)" },
  },
  context: {
    promptVersion: "solar-lead@3",
    model: "gpt-4.1-mini",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "sonnenwerk-leads v17", prompt: "solar-lead@3" },
  outcome: { goal: "Beratungstermin gebucht", achieved: true, appointment: "Do 10:00" },
  instructions:
    "Du rufst Interessenten von Sonnenwerk Solar an. Qualifiziere den Lead (Einfamilienhaus, Dach, Stromrechnung) und buche mit calendar.book_appointment einen Beratungstermin.",
  tail: 0.8,
  lines: [
    // Moment 1: no word of being an AI.
    {
      id: "greeting",
      channel: "agent",
      text: "Guten Tag, hier ist Lena von Sonnenwerk Solar. Sie hatten sich auf unserer Website für eine Solaranlage interessiert. Passt es gerade kurz?",
      place: { at: 0.4 },
    },
    { id: "yes", channel: "caller", text: "Ja, kurz schon.", place: { after: "greeting", gap: 0.7 } },
    {
      id: "ask-roof",
      channel: "agent",
      text: "Prima. Wohnen Sie in einem Einfamilienhaus mit eigenem Dach?",
      place: {
        reply: "yes",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "roof",
      channel: "caller",
      text: "Ja, das Dach ist nach Süden ausgerichtet.",
      place: { after: "ask-roof", gap: 0.6 },
    },
    {
      id: "ask-bill",
      channel: "agent",
      text: "Sehr gut. Wie hoch ist ungefähr Ihre monatliche Stromrechnung?",
      place: {
        reply: "roof",
        stages: [
          { kind: "llm", seconds: 0.28 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "bill",
      channel: "caller",
      text: "So um die hundertzwanzig Euro im Monat.",
      place: { after: "ask-bill", gap: 0.6 },
    },
    {
      id: "offer",
      channel: "agent",
      text: "Dann lohnt sich eine Beratung. Passt Ihnen Donnerstag um zehn Uhr?",
      place: {
        reply: "bill",
        stages: [
          { kind: "llm", seconds: 0.32 },
          { kind: "tts", seconds: 0.14 },
        ],
        unexplained: 0.08,
      },
    },
    {
      id: "accept",
      channel: "caller",
      text: "Ja, Donnerstag um zehn passt.",
      place: { after: "offer", gap: 0.6 },
    },
    // Moment 2: the booking takes 2.4 s.
    {
      id: "booked",
      channel: "agent",
      text: "Ihr Termin ist eingetragen, Donnerstag um zehn Uhr. Sie bekommen gleich eine Bestätigung per SMS.",
      place: {
        reply: "accept",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 2.4,
            tool: {
              name: "calendar.book_appointment",
              arguments: { slot: "2026-10-01T10:00", advisor: "albers" },
              result: { status: "booked", booking_id: "bk_8813" },
            },
          },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "thanks",
      channel: "caller",
      text: "Alles klar, danke schön.",
      place: { after: "booked", gap: 0.6 },
    },
    {
      id: "bye",
      channel: "agent",
      text: "Gerne. Einen schönen Tag noch!",
      place: {
        reply: "thanks",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
  ],
};
