/* A call for the debugger, written as the pipeline would have run it: who says what, how long the
 * turn detector waited, which stages each reply went through and how long each took, where the
 * caller cut in, and what the recogniser got wrong. Timing is derived, not typed in: lines are
 * placed after one another, or as replies whose start is the sum of their stages, so the planted
 * failures stay put when a voice speaks a little faster. */

import type { FindingType, Severity } from "@danolekh/earshot/trace";

export type Channel = "caller" | "agent";

/** A finding the detectors must make on a scenario: its type, the line it's attached to, how bad. */
export interface ExpectedFinding {
  type: FindingType;
  line: string;
  severity: Severity;
}

export interface ToolStage {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  /** Makes the call fail with this message. */
  error?: string;
}

/** One step of the agent's work before it speaks, in seconds: the model to its first token, a tool
 * call, speech synthesis to its first byte. */
export type Stage =
  | { kind: "llm"; seconds: number }
  | { kind: "tool"; seconds: number; tool: ToolStage }
  | { kind: "tts"; seconds: number };

export type Placement =
  /** At a fixed time (the greeting). */
  | { at: number }
  /** `gap` seconds after line `after` stopped. */
  | { after: string; gap: number }
  /** As the agent's reply to caller line `reply`: after its speech ended, the turn detector's wait,
   * then each stage, then `unexplained` seconds the pipeline doesn't account for. */
  | { reply: string; stages: readonly Stage[]; unexplained?: number };

export interface ScenarioLine {
  id: string;
  channel: Channel;
  text: string;
  /** For a caller who pauses mid-turn: the text in pieces, each after `pauseBefore` seconds of
   * silence. Joined, they are `text`. */
  chunks?: readonly { text: string; pauseBefore: number }[];
  place: Placement;
  /** The agent is cut off this long after it starts. */
  stopAfter?: number;
  /** The turn detector's final decision on a caller line: probability, and how long it waited
   * after the last sound. Default 0.9 and 0.35 s. */
  eou?: { probability: number; wait: number };
  /** The detector's probability at each mid-turn pause, which it rightly didn't act on. */
  pauseProbability?: number;
  /** What the agent heard, where it differs from what was said. */
  asr?: { drop?: readonly string[]; confidence?: Readonly<Record<string, number>> };
  /** The slot the line's number words fill. */
  entity?: string;
  /** Per-line engine, for lines one TTS engine mangles. */
  engine?: "chatterbox" | "say";
  /** Emphasis for Chatterbox. */
  exaggeration?: number;
}

export interface Voice {
  /** Chatterbox reference clip, relative to calls/. */
  prompt?: string;
  exaggeration?: number;
  cfg?: number;
  /** macOS voice for `say`. */
  say: string;
}

export interface Scenario {
  id: string;
  title: string;
  lang: "de" | "en";
  language: string;
  direction: "inbound" | "outbound";
  /** When the call started (ISO 8601, UTC). */
  startedAt: string;
  voices: Record<Channel, Voice>;
  /** What each reply ran on. */
  context: Readonly<Record<string, string>>;
  versions: Readonly<Record<string, string>>;
  outcome: Readonly<Record<string, unknown>>;
  /** The system prompt, as the model's context starts. */
  instructions: string;
  lines: readonly ScenarioLine[];
  /** Silence after the last line. */
  tail: number;
}

export const DEFAULT_EOU = { probability: 0.9, wait: 0.35 } as const;

/** A line's measured audio: each chunk's length in seconds. */
export type Durations = Readonly<Record<string, readonly number[]>>;

export interface Placed {
  line: ScenarioLine;
  /** When each chunk starts; the first is the line's start. */
  chunks: readonly { start: number; end: number }[];
  start: number;
  /** When its speech ends (or, for an agent cut off, where it was cut). */
  end: number;
  /** The whole generated audio's end, heard or not. */
  fullEnd: number;
  /** For a reply: the end of the speech it answers, and when each stage ran. */
  reply?: {
    anchor: number;
    wait: number;
    stages: readonly (Stage & { start: number })[];
    unexplained: number;
  };
}

const chunksOf = (line: ScenarioLine) => line.chunks ?? [{ text: line.text, pauseBefore: 0 }];

/** Every line's place on the call's timeline, from how long each chunk took to say. */
export function place(scenario: Scenario, durations: Durations): Placed[] {
  const byId = new Map<string, Placed>();
  const out: Placed[] = [];
  for (const line of scenario.lines) {
    const lengths = durations[line.id];
    const parts = chunksOf(line);
    if (!lengths || lengths.length !== parts.length) throw new Error(`${line.id}: no duration per chunk`);
    const ref = (id: string) => {
      const p = byId.get(id);
      if (!p) throw new Error(`${line.id}: refers to ${id}, which isn't placed yet`);
      return p;
    };
    let start: number;
    let reply: Placed["reply"];
    if ("at" in line.place) start = line.place.at;
    else if ("after" in line.place) start = ref(line.place.after).end + line.place.gap;
    else {
      const asked = ref(line.place.reply);
      const wait = (asked.line.eou ?? DEFAULT_EOU).wait;
      let t = asked.end + wait;
      const stages = line.place.stages.map((s) => {
        const at = t;
        t += s.seconds;
        return { ...s, start: at };
      });
      const unexplained = line.place.unexplained ?? 0;
      start = t + unexplained;
      reply = { anchor: asked.end, wait, stages, unexplained };
    }
    let t = start;
    const chunks = parts.map((c, i) => {
      if (i > 0) t += c.pauseBefore;
      const span = { start: t, end: t + lengths[i]! };
      t = span.end;
      return span;
    });
    const fullEnd = t;
    const end = line.stopAfter !== undefined ? Math.min(fullEnd, start + line.stopAfter) : fullEnd;
    const placed: Placed = { line, chunks, start, end, fullEnd, ...(reply && { reply }) };
    byId.set(line.id, placed);
    out.push(placed);
  }
  return out;
}

/** Rough chunk lengths for a draft without audio: a third of a second per word. */
export function estimateDurations(scenario: Scenario): Durations {
  return Object.fromEntries(
    scenario.lines.map((l) => [
      l.id,
      chunksOf(l).map((c) => 0.33 * c.text.split(/\s+/).filter(Boolean).length),
    ]),
  );
}

export { chunksOf };
