/* The demo calls: invented businesses, invented people, invented numbers. Each turn is spoken by a
 * macOS voice, placed on the call's timeline, and timed word by word by whisper.cpp (see
 * build.ts). `gap` is the silence before a turn; `barge` starts a caller turn as the agent turn
 * before it reaches that word, cutting the agent off there. Events hang off a turn's start or
 * end. */

export interface ScriptTurn {
  role: "agent" | "user";
  text: string;
  /** Chatterbox's emotion exaggeration for this line (0.25 flat to 1 animated). */
  exaggeration?: number;
  /** Seconds of silence before it; 0.5 by default. */
  gap?: number;
  /** For a caller turn: cuts in as the agent turn before it reaches this word, which stops there. */
  barge?: string;
}

export interface ScriptEvent {
  turn: number;
  edge: "start" | "end";
  /** Seconds after the edge. */
  offset: number;
  event:
    | {
        type: "tool_call";
        name: string;
        duration: number;
        status?: "ok" | "error";
        args?: unknown;
        result?: unknown;
      }
    | { type: "intent"; label: string; confidence?: number }
    | { type: "verdict"; judge: string; pass: boolean; score?: number; reason?: string }
    | { type: "note"; label: string };
}

export interface CallScript {
  id: string;
  lang: "en" | "de";
  /** Chatterbox voices: a reference clip in calls/voices (none: the model's built-in voice). */
  voices: Record<"agent" | "user", { prompt?: string; exaggeration?: number; cfg?: number }>;
  /** macOS voices for `--engine say`. */
  say: { agent: string; user: string };
  speakers: { agent: string; user: string };
  /** Split each wait for the agent into STT, LLM and TTS spans. */
  stages?: boolean;
  turns: ScriptTurn[];
  events: ScriptEvent[];
}

/** A home-insurance line: the caller moved and updates the address, then asks about cover. For the
 * contact-centre skin: identity check, three tool calls, a barge-in, judges, one slow reply. */
export const insurance: CallScript = {
  id: "alder-mutual-address",
  lang: "en",
  voices: {
    agent: { exaggeration: 0.4, cfg: 0.5 },
    user: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.55, cfg: 0.4 },
  },
  say: { agent: "Samantha", user: "Daniel" },
  speakers: { agent: "Agent", user: "Martin" },
  stages: true,
  turns: [
    {
      role: "agent",
      gap: 0.3,
      text: "Thanks for calling Alder Mutual, this is the virtual assistant. How can I help you today?",
    },
    {
      role: "user",
      gap: 0.6,
      text: "Hi, yes. I moved last month, and I need to update the address on my home policy.",
    },
    {
      role: "agent",
      gap: 0.85,
      text: "Of course. Before I change anything, can you confirm your date of birth and the postcode on the policy?",
    },
    {
      role: "user",
      gap: 0.5,
      text: "Sure. Fourteenth of March, nineteen eighty-eight, and the old postcode is ten ninety-seven.",
    },
    {
      role: "agent",
      gap: 1.05,
      text: "Thank you, Martin, you're verified. I can see your home policy ending in four two one. What's the new address?",
    },
    { role: "user", gap: 0.5, text: "It's Linden Street twelve, apartment three, in Graz. Eight oh one oh." },
    {
      role: "agent",
      gap: 0.95,
      text: "Done. Your policy now lists Linden Street twelve, apartment three, eight oh one oh Graz. Your premium stays the same, and I'll email the updated certificate in a few minutes. Is there anything else I can help you with?",
    },
    { role: "user", barge: "anything", text: "Actually, does the move change my contents cover?" },
    {
      role: "agent",
      gap: 1.7,
      text: "Good question. Your contents cover moves with you, and the amount stays at forty thousand euros. If the new flat has more valuables, I can pass you to a specialist.",
    },
    { role: "user", gap: 0.5, text: "No, that's fine. Thanks a lot." },
    { role: "agent", gap: 0.6, text: "You're welcome, Martin. Have a good day." },
  ],
  events: [
    {
      turn: 1,
      edge: "end",
      offset: 0.1,
      event: { type: "intent", label: "update_address", confidence: 0.94 },
    },
    {
      turn: 3,
      edge: "end",
      offset: 0.2,
      event: {
        type: "tool_call",
        name: "verify_identity",
        duration: 0.32,
        args: { dob: "1988-03-14", postcode: "1097" },
        result: { verified: true },
      },
    },
    {
      turn: 3,
      edge: "end",
      offset: 0.56,
      event: {
        type: "tool_call",
        name: "lookup_policy",
        duration: 0.28,
        args: { customer: "C-20418" },
        result: { policy: "HOME-…421" },
      },
    },
    {
      turn: 5,
      edge: "end",
      offset: 0.2,
      event: {
        type: "tool_call",
        name: "update_address",
        duration: 0.41,
        args: { policy: "HOME-…421", street: "Linden Street 12/3", city: "Graz", postcode: "8010" },
        result: { updated: true, premiumChange: 0 },
      },
    },
    {
      turn: 7,
      edge: "end",
      offset: 0.1,
      event: { type: "intent", label: "coverage_question", confidence: 0.88 },
    },
    {
      turn: 7,
      edge: "end",
      offset: 0.25,
      event: {
        type: "tool_call",
        name: "get_coverage",
        duration: 0.9,
        args: { policy: "HOME-…421" },
        result: { contents: 40000 },
      },
    },
    {
      turn: 10,
      edge: "end",
      offset: 0.3,
      event: {
        type: "verdict",
        judge: "Task success",
        pass: true,
        score: 0.96,
        reason: "Address updated on the right policy after identity was verified.",
      },
    },
    {
      turn: 10,
      edge: "end",
      offset: 0.3,
      event: {
        type: "verdict",
        judge: "Read-back",
        pass: true,
        score: 0.9,
        reason: "The agent read the new address back in full before closing.",
      },
    },
    {
      turn: 10,
      edge: "end",
      offset: 0.3,
      event: {
        type: "verdict",
        judge: "Interruption",
        pass: true,
        score: 0.85,
        reason: "Stopped at the barge-in and answered the new question.",
      },
    },
    {
      turn: 10,
      edge: "end",
      offset: 0.3,
      event: {
        type: "verdict",
        judge: "Response time",
        pass: false,
        score: 0.4,
        reason: "1.7 s before answering the cover question, over the 1.2 s budget.",
      },
    },
  ],
};

/** A physiotherapy practice in Vienna: the caller books a first appointment. For the small-business
 * skin: in German, an availability lookup, a booking, an SMS, and a barge-in. */
export const booking: CallScript = {
  id: "physio-brandl-termin",
  lang: "de",
  voices: {
    agent: { exaggeration: 0.45, cfg: 0.5 },
    user: { prompt: "voices/caller-thorsten.wav", exaggeration: 0.55, cfg: 0.4 },
  },
  say: { agent: "Petra (Premium)", user: "Eddy (German (Germany))" },
  speakers: { agent: "Assistentin", user: "Thomas Huber" },
  turns: [
    {
      role: "agent",
      gap: 0.3,
      text: "Physiotherapie Brandl, guten Tag. Hier spricht die digitale Assistentin. Wie kann ich Ihnen helfen?",
    },
    {
      role: "user",
      gap: 0.6,
      text: "Grüß Gott, ich bräuchte einen Termin. Ich habe seit einer Woche Rückenschmerzen.",
    },
    {
      role: "agent",
      gap: 0.7,
      text: "Das tut mir leid. Haben Sie eine Überweisung von Ihrem Arzt, oder möchten Sie privat kommen?",
    },
    { role: "user", gap: 0.5, text: "Ich habe eine Überweisung, ja." },
    {
      role: "agent",
      gap: 0.9,
      text: "Sehr gut. Ich hätte Donnerstag um neun Uhr dreißig, oder Freitag um sechzehn Uhr. Nächste Woche wäre außerdem Montag früh frei.",
    },
    { role: "user", barge: "Montag", text: "Donnerstag um halb zehn passt mir gut." },
    { role: "agent", gap: 0.7, text: "Perfekt. Darf ich Ihren Namen und eine Telefonnummer notieren?" },
    {
      role: "user",
      gap: 0.5,
      text: "Huber, Thomas. Die Nummer ist null sechs sechs vier, null null null, eins zwei drei vier.",
    },
    {
      role: "agent",
      gap: 1.0,
      text: "Danke, Herr Huber. Ihr Termin ist am Donnerstag um neun Uhr dreißig. Sie bekommen gleich eine SMS zur Bestätigung. Bitte bringen Sie die Überweisung mit.",
    },
    { role: "user", gap: 0.5, text: "Super, danke. Wiederschauen." },
    { role: "agent", gap: 0.5, text: "Auf Wiederhören!" },
  ],
  events: [
    {
      turn: 1,
      edge: "end",
      offset: 0.1,
      event: { type: "intent", label: "Terminbuchung", confidence: 0.97 },
    },
    {
      turn: 3,
      edge: "end",
      offset: 0.2,
      event: {
        type: "tool_call",
        name: "kalender.freie_termine",
        duration: 0.45,
        args: { dauer: 50, art: "Erstbefund" },
        result: ["Do 09:30", "Fr 16:00", "Mo 08:00"],
      },
    },
    {
      turn: 7,
      edge: "end",
      offset: 0.2,
      event: {
        type: "tool_call",
        name: "kalender.buchen",
        duration: 0.38,
        args: { termin: "Do 09:30", name: "Thomas Huber", telefon: "0664 000 1234" },
        result: { gebucht: true },
      },
    },
    {
      turn: 7,
      edge: "end",
      offset: 0.62,
      event: {
        type: "tool_call",
        name: "sms.senden",
        duration: 0.22,
        args: { an: "0664 000 1234" },
        result: { gesendet: true },
      },
    },
  ],
};

/** The mic playground's replies: one agent line each, played after the visitor stops talking. They
 * say what the orb is doing, since without an AI behind it the page can't answer the words. */
const reply = (n: number, text: string): CallScript => ({
  id: `reply-${n}`,
  lang: "en",
  voices: { agent: { exaggeration: 0.5, cfg: 0.5 }, user: {} },
  say: { agent: "Samantha", user: "Daniel" },
  speakers: { agent: "earshot", user: "You" },
  turns: [{ role: "agent", gap: 0.15, text }],
  events: [],
});

export const REPLIES: readonly CallScript[] = [
  reply(
    1,
    "I heard you. While you talk, I lean toward you and my rim lights up. That's what listening looks like.",
  ),
  reply(2, "Now I'm the one speaking. My core warms up, and every syllable sends a ring outward."),
  reply(
    3,
    "When I think, there's no sound at all, just one bright arc turning. That's how you tell the states apart.",
  ),
  reply(
    4,
    "I'm a demo, not a real assistant yet. Everything you see here is earshot's parts, styled with plain CSS.",
  ),
];

export const SCRIPTS: readonly CallScript[] = [insurance, booking, ...REPLIES];
