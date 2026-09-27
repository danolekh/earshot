/* An outbound call to rearrange a parcel delivery. Invented company. Nothing goes wrong: the
 * contrast in the list, a call with no findings. */
import type { Scenario } from "../scenario.ts";

export const paket: Scenario = {
  id: "paket-rueckruf",
  title: "Blitzpaket · Neue Zustellung",
  lang: "de",
  language: "de-DE",
  direction: "outbound",
  startedAt: "2026-09-26T07:58:12Z",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5, say: "Petra (Premium)" },
    caller: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.5, cfg: 0.4, say: "Markus (Premium)" },
  },
  context: {
    promptVersion: "zustellung@9",
    model: "gpt-4.1-mini",
    stt: "deepgram nova-3 (de)",
    tts: "cartesia sonic-2 (de)",
    turnDetector: "livekit turn-detector (multilingual)",
    interruptionMode: "vad, min 0.5 s",
  },
  versions: { agent: "blitzpaket-outbound v31", prompt: "zustellung@9" },
  outcome: { goal: "Zustellung neu geplant", achieved: true, window: "morgen 14–18 Uhr" },
  instructions:
    "Du bist die digitale Assistentin von Blitzpaket. Sag, dass du eine KI bist. Plane nicht zugestellte Pakete mit delivery.reschedule neu.",
  tail: 0.8,
  lines: [
    {
      id: "greeting",
      channel: "agent",
      text: "Guten Morgen, hier ist die digitale Assistentin von Blitzpaket. Ich bin eine KI. Wir konnten Ihr Paket gestern nicht zustellen. Wann passt Ihnen eine neue Zustellung?",
      place: { at: 0.4 },
    },
    {
      id: "when",
      channel: "caller",
      text: "Morgen Nachmittag wäre gut.",
      place: { after: "greeting", gap: 0.7 },
    },
    {
      id: "confirm",
      channel: "agent",
      text: "Alles klar. Die Zustellung ist für morgen zwischen vierzehn und achtzehn Uhr geplant. Brauchen Sie sonst noch etwas?",
      place: {
        reply: "when",
        stages: [
          { kind: "llm", seconds: 0.3 },
          {
            kind: "tool",
            seconds: 0.35,
            tool: {
              name: "delivery.reschedule",
              arguments: { parcel: "BP-4471-2208", window: "2026-09-27T14:00/18:00" },
              result: { status: "rescheduled" },
            },
          },
          { kind: "llm", seconds: 0.2 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
    { id: "no", channel: "caller", text: "Nein, das war alles.", place: { after: "confirm", gap: 0.6 } },
    {
      id: "bye",
      channel: "agent",
      text: "Gerne. Einen schönen Tag noch!",
      place: {
        reply: "no",
        stages: [
          { kind: "llm", seconds: 0.3 },
          { kind: "tts", seconds: 0.14 },
        ],
      },
    },
  ],
};
