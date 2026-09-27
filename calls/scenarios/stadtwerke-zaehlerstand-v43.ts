/* The meter-reading call again, on the fixed agent (v43): the same caller and the same flow, with
 * what went wrong on v42 fixed, so a test drafted from the bad call can be seen to pass. Invented
 * company, person and numbers.
 *
 *   1. The turn detector holds while a number is being dictated: the pause mid-number is waited
 *      out (no early end of turn, nobody talked over).
 *   2. The recogniser is told to expect numerals: "null" is heard, the first lookup finds the
 *      contract (no repeat, no failed tool).
 *   3. Saving the reading is queued: the CRM answers in 0.35 s (no slow reply, no dead air). */
import type { Scenario } from "../scenario.ts";

export const stadtwerkeV43: Scenario = {
  id: "stadtwerke-zaehlerstand-v43",
  title: "Stadtwerke Muster · Zählerstand",
  lang: "de",
  language: "de-DE",
  direction: "outbound",
  startedAt: "2026-09-26T15:42:18Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.55, cfg: 0.4, say: "Anna (Premium)" },
  },
  context: {
    promptVersion: "zaehlerstand@8",
    model: "gpt-4.1",
    stt: "deepgram nova-3 (de, numerals)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual) + entity hold",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "stadtwerke-outbound v43", prompt: "zaehlerstand@8" },
  outcome: {
    goal: "Zählerstand erfasst",
    achieved: true,
    meter_reading_submitted: true,
    customer_id: "471083",
    reading_kwh: 1243,
    id_attempts: 1,
  },
  instructions:
    "Du bist die digitale Assistentin der Stadtwerke Muster. Sag zu Beginn, dass du eine KI bist, und frag nach der Einwilligung zur Aufzeichnung. Erfrage die Kundennummer, prüfe sie mit crm.lookup_customer und speichere den Zählerstand mit crm.submit_meter_reading.",
  tail: 0.8,
  lines: [
    {
      id: "greeting",
      channel: "agent",
      text: "Guten Tag, hier ist die digitale Assistentin der Stadtwerke Muster. Ich bin eine KI. Darf ich das Gespräch zur Qualitätssicherung aufzeichnen?",
      place: { at: 0.4 },
    },
    {
      id: "consent",
      channel: "caller",
      text: "Ja, das ist in Ordnung.",
      place: { after: "greeting", gap: 0.7 },
    },
    {
      id: "ask-id",
      channel: "agent",
      text: "Danke. Es geht um Ihren Zählerstand. Können Sie mir bitte Ihre Kundennummer nennen?",
      place: {
        reply: "consent",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
        unexplained: 0.12,
      },
    },
    // Fix 1: the same 0.6 s pause mid-number, now waited out; fix 2: every digit heard.
    {
      id: "dictate",
      channel: "caller",
      text: "Ja, die ist vier sieben eins null acht drei.",
      chunks: [
        { text: "Ja, die ist vier sieben eins", pauseBefore: 0 },
        { text: "null acht drei.", pauseBefore: 0.6 },
      ],
      place: { after: "ask-id", gap: 0.6 },
      pauseProbability: 0.06,
      entity: "customer_id",
    },
    {
      id: "found",
      channel: "agent",
      text: "Danke, Frau Keller, ich habe Sie gefunden. Wie lautet Ihr aktueller Zählerstand?",
      place: {
        reply: "dictate",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 0.21,
            tool: {
              name: "crm.lookup_customer",
              arguments: { customer_id: "471083" },
              result: { customer_id: "471083", name: "Petra Keller", meter: "Strom, Zähler 1ESY1160543" },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "reading",
      channel: "caller",
      text: "Zwölf dreiundvierzig.",
      place: { after: "found", gap: 0.7 },
      entity: "meter_reading",
    },
    // Fix 3: the save is queued, and answers in 0.35 s.
    {
      id: "saved",
      channel: "agent",
      text: "Vielen Dank, der Zählerstand zwölf dreiundvierzig ist gespeichert.",
      place: {
        reply: "reading",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 0.35,
            tool: {
              name: "crm.submit_meter_reading",
              arguments: { customer_id: "471083", reading_kwh: 1243 },
              result: { status: "queued", reading_id: "mr_20260926_1542" },
            },
          },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    { id: "thanks", channel: "caller", text: "Super, danke.", place: { after: "saved", gap: 0.6 } },
    {
      id: "goodbye",
      channel: "agent",
      text: "Gerne. Einen schönen Tag noch, Frau Keller. Auf Wiederhören!",
      place: {
        reply: "thanks",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
        unexplained: 0.12,
      },
    },
  ],
};
