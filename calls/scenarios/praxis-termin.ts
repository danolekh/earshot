/* An inbound call to a doctor's practice to move an appointment. Invented practice and person.
 * Two things go wrong, both about when the agent stops talking:
 *
 *   1. The caller says "Mhm." while the agent lists free slots, and the agent stops for it: a
 *      backchannel taken for an interruption. The caller has to ask for the slots again, and the
 *      agent repeats them.
 *   2. Later the caller cuts in ("Moment, bitte an meine neue Nummer!") and the agent keeps
 *      reading out the confirmation over them. */
import type { Scenario } from "../scenario.ts";

export const praxis: Scenario = {
  id: "praxis-termin",
  title: "Praxis Dr. Berger · Termin verschieben",
  lang: "de",
  language: "de-DE",
  direction: "inbound",
  startedAt: "2026-09-25T08:03:41Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.5, cfg: 0.4, say: "Markus (Premium)" },
  },
  context: {
    promptVersion: "praxis-termine@12",
    model: "gpt-4.1",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.3 s",
  },
  versions: { agent: "praxis-inbound v8", prompt: "praxis-termine@12" },
  outcome: { goal: "Termin verschoben", achieved: true, new_slot: "Do 14:00" },
  instructions:
    "Du bist die digitale Assistentin der Praxis Dr. Berger. Sag, dass du eine KI bist. Verschiebe Termine mit calendar.find_slots und calendar.move_appointment.",
  tail: 0.8,
  lines: [
    {
      id: "greeting",
      channel: "agent",
      text: "Praxis Doktor Berger, Sie sprechen mit der digitalen Assistentin. Ich bin eine KI. Wie kann ich Ihnen helfen?",
      place: { at: 0.4 },
    },
    {
      id: "ask",
      channel: "caller",
      text: "Ich möchte meinen Termin am Dienstag verschieben.",
      place: { after: "greeting", gap: 0.7 },
    },
    {
      id: "ask-name",
      channel: "agent",
      text: "Gerne. Wie ist Ihr Name, bitte?",
      place: {
        reply: "ask",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    { id: "name", channel: "caller", text: "Jonas Wagner.", place: { after: "ask-name", gap: 0.6 } },
    // Moment 1: "Mhm." 2.8 s into the list, and the agent stops 0.1 s later.
    {
      id: "slots",
      channel: "agent",
      text: "Danke, Herr Wagner. Ich habe folgende Termine frei: Mittwoch um neun Uhr, Donnerstag um vierzehn Uhr oder Freitag um elf Uhr.",
      place: {
        reply: "name",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 0.4,
            tool: {
              name: "calendar.find_slots",
              arguments: { patient: "wagner-jonas", after: "2026-09-29" },
              result: { slots: ["Mi 09:00", "Do 14:00", "Fr 11:00"] },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
      stopAfter: 2.9,
    },
    // The slots reply starts 1.34 s after "name" ends (0.35 wait + 0.99 of stages).
    { id: "mhm", channel: "caller", text: "Mhm.", place: { after: "name", gap: 4.14 } },
    {
      id: "sorry",
      channel: "agent",
      text: "Entschuldigung, ich habe Sie unterbrochen. Was möchten Sie sagen?",
      place: {
        reply: "mhm",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "again",
      channel: "caller",
      text: "Nichts, ich habe nur zugehört. Welche Termine waren das?",
      place: { after: "sorry", gap: 0.6 },
    },
    {
      id: "slots-again",
      channel: "agent",
      text: "Mittwoch um neun, Donnerstag um vierzehn oder Freitag um elf Uhr.",
      place: {
        reply: "again",
        stages: [
          { kind: "llm", seconds: 0.28 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "choose",
      channel: "caller",
      text: "Donnerstag um vierzehn Uhr, bitte.",
      place: { after: "slots-again", gap: 0.6 },
    },
    // Moment 2: the caller cuts in 2 s into the confirmation, and the agent reads on.
    {
      id: "confirm",
      channel: "agent",
      text: "Alles klar. Ich verschiebe Ihren Termin auf Donnerstag um vierzehn Uhr und schicke Ihnen eine Bestätigung per SMS an die hinterlegte Nummer.",
      place: {
        reply: "choose",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 0.4,
            tool: {
              name: "calendar.move_appointment",
              arguments: { patient: "wagner-jonas", to: "2026-10-01T14:00" },
              result: { status: "moved" },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    // "confirm" starts 1.34 s after "choose" ends (0.35 wait + 0.99 of stages), under the 1.5 s a
    // slow reply is flagged at.
    {
      id: "cut-in",
      channel: "caller",
      text: "Moment, bitte an meine neue Nummer!",
      place: { after: "choose", gap: 3.34 },
    },
    {
      id: "new-number",
      channel: "agent",
      text: "Entschuldigung. Wie lautet Ihre neue Nummer?",
      place: {
        reply: "cut-in",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "number",
      channel: "caller",
      text: "Null eins sieben zwei, vier fünf sechs, drei drei neun.",
      place: { after: "new-number", gap: 0.6 },
      entity: "phone",
    },
    {
      id: "done",
      channel: "agent",
      text: "Danke, die Bestätigung geht an die neue Nummer. Bis Donnerstag!",
      place: {
        reply: "number",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
  ],
};
