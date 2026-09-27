/* The debugger's demo call: a municipal utility's AI agent phones a customer for a meter reading.
 * Invented company, person and numbers. Three things go wrong, each planted where a real pipeline
 * gets it wrong:
 *
 *   1. The caller pauses while dictating the customer number; the turn detector ends her turn, the
 *      agent starts answering over "null acht drei" and is cut off (early end of turn).
 *   2. On the repeat, the recogniser drops "null"; the lookup runs with 47183, fails, and the agent
 *      asks for the number again (what the agent heard vs what was said, a tool error, a repeat).
 *   3. Saving the reading takes the CRM 1.9 s; the caller hears 3.1 s of nothing and says "Hallo?",
 *      and the agent then talks over it. The pipeline reports 2.64 s; 0.46 s is nowhere in its
 *      spans (a slow turn blamed on the wrong stage).
 *
 * The digit-by-digit spelling that fixes (2) is the contrast to (1): the detector waits out every
 * pause. */
import type { Scenario } from "../scenario.ts";

const lookup = (id: string, found: boolean) => ({
  kind: "tool" as const,
  seconds: found ? 0.21 : 0.18,
  tool: {
    name: "crm.lookup_customer",
    arguments: { customer_id: id },
    result: found
      ? { customer_id: id, name: "Petra Keller", meter: "Strom, Zähler 1ESY1160543" }
      : { status: 404 },
    ...(!found && { error: `404: no contract for customer_id ${id}` }),
  },
});

export const stadtwerke: Scenario = {
  id: "stadtwerke-zaehlerstand",
  title: "Stadtwerke Muster · Zählerstand",
  lang: "de",
  language: "de-DE",
  direction: "outbound",
  startedAt: "2026-09-24T09:14:02Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.55, cfg: 0.4, say: "Anna (Premium)" },
  },
  context: {
    promptVersion: "zaehlerstand@7",
    model: "gpt-4.1",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "stadtwerke-outbound v42", prompt: "zaehlerstand@7" },
  outcome: {
    goal: "Zählerstand erfasst",
    achieved: true,
    meter_reading_submitted: true,
    customer_id: "471083",
    reading_kwh: 1243,
    id_attempts: 3,
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
    // Moment 1: a 0.6 s pause mid-number, taken for the end of the turn.
    {
      id: "dictate-1",
      channel: "caller",
      text: "Ja, die ist vier sieben eins",
      place: { after: "ask-id", gap: 0.6 },
      eou: { probability: 0.62, wait: 0.31 },
      entity: "customer_id",
    },
    {
      id: "dictate-2",
      channel: "caller",
      text: "null acht drei.",
      place: { after: "dictate-1", gap: 0.6 },
      entity: "customer_id",
    },
    {
      id: "noted",
      channel: "agent",
      text: "Danke, ich habe die vier sieben eins notiert. Stimmt das so?",
      place: {
        reply: "dictate-1",
        stages: [
          { kind: "llm", seconds: 0.25 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
      stopAfter: 0.45,
    },
    {
      id: "sorry",
      channel: "agent",
      text: "Entschuldigung, ich habe Sie unterbrochen. Wie war die Nummer noch mal?",
      place: {
        reply: "dictate-2",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
        unexplained: 0.1,
      },
    },
    // Moment 2: "null" not heard, the lookup fails, the agent asks again.
    {
      id: "repeat-id",
      channel: "caller",
      text: "Vier sieben eins null acht drei.",
      place: { after: "sorry", gap: 0.6 },
      asr: { drop: ["null"], confidence: { acht: 0.41 } },
      entity: "customer_id",
    },
    {
      id: "not-found",
      channel: "agent",
      text: "Unter der Nummer vier sieben eins acht drei finde ich leider keinen Vertrag. Können Sie mir bitte Ihre Kundennummer noch einmal nennen?",
      place: {
        reply: "repeat-id",
        stages: [
          { kind: "llm", seconds: 0.25 },
          lookup("47183", false),
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "spell-id",
      channel: "caller",
      text: "Vier. Sieben. Eins. Null. Acht. Drei.",
      chunks: [
        { text: "Vier.", pauseBefore: 0 },
        { text: "Sieben.", pauseBefore: 0.35 },
        { text: "Eins.", pauseBefore: 0.35 },
        { text: "Null.", pauseBefore: 0.35 },
        { text: "Acht.", pauseBefore: 0.35 },
        { text: "Drei.", pauseBefore: 0.35 },
      ],
      place: { after: "not-found", gap: 0.7 },
      pauseProbability: 0.08,
      entity: "customer_id",
    },
    {
      id: "found",
      channel: "agent",
      text: "Danke, Frau Keller, ich habe Sie gefunden. Wie lautet Ihr aktueller Zählerstand?",
      place: {
        reply: "spell-id",
        stages: [
          { kind: "llm", seconds: 0.25 },
          lookup("471083", true),
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    // Moment 3: the save takes 1.9 s, and 0.46 s more goes unaccounted for.
    {
      id: "reading",
      channel: "caller",
      text: "Zwölf dreiundvierzig.",
      place: { after: "found", gap: 0.7 },
      entity: "meter_reading",
    },
    {
      id: "hello",
      channel: "caller",
      text: "Hallo? Sind Sie noch da?",
      place: { after: "reading", gap: 2.3 },
    },
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
            seconds: 1.9,
            tool: {
              name: "crm.submit_meter_reading",
              arguments: { customer_id: "471083", reading_kwh: 1243 },
              result: { status: "stored", reading_id: "mr_20260926_0412" },
            },
          },
          { kind: "tts", seconds: 0.14 },
        ],
        unexplained: 0.46,
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
