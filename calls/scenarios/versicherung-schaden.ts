/* An inbound call to a car insurer to report a small accident. Invented insurer and person. Two
 * things go wrong:
 *
 *   1. The recogniser isn't sure of the caller's surname (0.38), and nobody checks it.
 *   2. The caller says where it happened in two parts; the turn detector ends the turn after the
 *      first ("Lindenstraße,"), and the agent starts answering over "Ecke Bahnhofstraße". */
import type { Scenario } from "../scenario.ts";

export const versicherung: Scenario = {
  id: "versicherung-schaden",
  title: "Hanse Mobil · Schadenmeldung",
  lang: "de",
  language: "de-DE",
  direction: "inbound",
  startedAt: "2026-09-23T16:47:05Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.5, cfg: 0.4, say: "Markus (Premium)" },
  },
  context: {
    promptVersion: "schaden-fnol@5",
    model: "gpt-4.1",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "hanse-fnol v23", prompt: "schaden-fnol@5" },
  outcome: { goal: "Schaden gemeldet", achieved: true, claim_id: "SM-2026-07731" },
  instructions:
    "Du bist die digitale Assistentin der Hanse Mobil Versicherung. Sag, dass du eine KI bist. Nimm Schadenmeldungen auf: Name, Ort, Verletzte, Fotos.",
  tail: 0.8,
  lines: [
    {
      id: "greeting",
      channel: "agent",
      text: "Hanse Mobil Versicherung, hier spricht Ihre digitale Assistentin. Ich bin eine KI. Möchten Sie einen Schaden melden?",
      place: { at: 0.4 },
    },
    {
      id: "yes",
      channel: "caller",
      text: "Ja, ich hatte heute Morgen einen kleinen Auffahrunfall.",
      place: { after: "greeting", gap: 0.7 },
    },
    {
      id: "ask-name",
      channel: "agent",
      text: "Das tut mir leid. Wie ist Ihr vollständiger Name?",
      place: {
        reply: "yes",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    // Moment 1: the surname heard at 0.38.
    {
      id: "name",
      channel: "caller",
      text: "Murat Özdemir.",
      place: { after: "ask-name", gap: 0.6 },
      asr: { confidence: { özdemir: 0.38 } },
    },
    {
      id: "ask-where",
      channel: "agent",
      text: "Danke, Herr Özdemir. Wo ist der Unfall passiert?",
      place: {
        reply: "name",
        stages: [
          { kind: "llm", seconds: 0.28 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    // Moment 2: a 0.6 s pause after the first street, taken for the end of the turn.
    {
      id: "where-1",
      channel: "caller",
      text: "Das war in der Lindenstraße,",
      place: { after: "ask-where", gap: 0.6 },
      eou: { probability: 0.6, wait: 0.3 },
    },
    {
      id: "where-2",
      channel: "caller",
      text: "Ecke Bahnhofstraße.",
      place: { after: "where-1", gap: 0.6 },
    },
    {
      id: "noted",
      channel: "agent",
      text: "Danke, Lindenstraße ist notiert. Gab es Verletzte?",
      place: {
        reply: "where-1",
        stages: [
          { kind: "llm", seconds: 0.25 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
      stopAfter: 0.5,
    },
    {
      id: "sorry",
      channel: "agent",
      text: "Entschuldigung. Also Lindenstraße Ecke Bahnhofstraße. Gab es Verletzte?",
      place: {
        reply: "where-2",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "injured",
      channel: "caller",
      text: "Nein, zum Glück nicht. Nur die Stoßstange ist kaputt.",
      place: { after: "sorry", gap: 0.6 },
    },
    {
      id: "photos",
      channel: "agent",
      text: "Gut zu hören. Ich schicke Ihnen einen Link, über den Sie Fotos vom Schaden hochladen können.",
      place: {
        reply: "injured",
        stages: [
          { kind: "llm", seconds: 0.25 },
          {
            kind: "tool",
            seconds: 0.35,
            tool: {
              name: "claims.create",
              arguments: { name: "Murat Özdemir", location: "Lindenstraße / Bahnhofstraße", injured: false },
              result: { claim_id: "SM-2026-07731", upload_link_sent: true },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    { id: "thanks", channel: "caller", text: "Prima, danke.", place: { after: "photos", gap: 0.6 } },
    {
      id: "bye",
      channel: "agent",
      text: "Gerne, Herr Özdemir. Alles Gute!",
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
