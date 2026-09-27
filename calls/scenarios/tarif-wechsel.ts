/* An inbound call to switch to a cheaper electricity tariff. Invented supplier. One thing goes
 * wrong: comparing tariffs, the model takes 2.75 s to its first token, and the caller hears 3.2 s
 * of nothing. The slow stage is the model, not a tool: the fix is a smaller context or a faster
 * model, not the backend. */
import type { Scenario } from "../scenario.ts";

export const tarif: Scenario = {
  id: "tarif-wechsel",
  title: "Nordstrom Energie · Tarifwechsel",
  lang: "de",
  language: "de-DE",
  direction: "inbound",
  startedAt: "2026-09-22T11:20:33Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.5, cfg: 0.4, say: "Markus (Premium)" },
  },
  context: {
    promptVersion: "tarifwechsel@2",
    model: "gpt-4.1",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "nordstrom-service v5", prompt: "tarifwechsel@2" },
  outcome: { goal: "Tarif gewechselt", achieved: true, tariff: "Öko Plus" },
  instructions:
    "Du bist die KI-Assistentin des Kundenservice von Nordstrom Energie. Vergleiche Tarife anhand des Jahresverbrauchs und wechsle mit contract.switch_tariff.",
  tail: 0.8,
  lines: [
    {
      id: "greeting",
      channel: "agent",
      text: "Nordstrom Energie, guten Tag. Ich bin die KI-Assistentin des Kundenservice. Worum geht es?",
      place: { at: 0.4 },
    },
    {
      id: "ask",
      channel: "caller",
      text: "Ich möchte in einen günstigeren Tarif wechseln.",
      place: { after: "greeting", gap: 0.7 },
    },
    {
      id: "ask-usage",
      channel: "agent",
      text: "Gerne. Wie hoch ist Ihr Jahresverbrauch ungefähr?",
      place: {
        reply: "ask",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "usage",
      channel: "caller",
      text: "Ungefähr dreitausend Kilowattstunden.",
      place: { after: "ask-usage", gap: 0.6 },
    },
    // The moment: 2.75 s to the model's first token.
    {
      id: "compare",
      channel: "agent",
      text: "Bei dreitausend Kilowattstunden wäre unser Tarif Öko Plus am günstigsten. Sie sparen etwa hundertvierzig Euro im Jahr.",
      place: {
        reply: "usage",
        stages: [
          { kind: "llm", seconds: 2.75 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    {
      id: "accept",
      channel: "caller",
      text: "Das klingt gut. Machen Sie das bitte.",
      place: { after: "compare", gap: 0.6 },
    },
    {
      id: "switched",
      channel: "agent",
      text: "Erledigt. Ihr neuer Tarif gilt ab dem ersten November. Die Bestätigung kommt per E-Mail.",
      place: {
        reply: "accept",
        stages: [
          { kind: "llm", seconds: 0.3 },
          {
            kind: "tool",
            seconds: 0.45,
            tool: {
              name: "contract.switch_tariff",
              arguments: { tariff: "oeko-plus", from: "2026-11-01" },
              result: { status: "switched" },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    { id: "thanks", channel: "caller", text: "Super, vielen Dank.", place: { after: "switched", gap: 0.6 } },
    {
      id: "bye",
      channel: "agent",
      text: "Gerne. Auf Wiederhören!",
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
