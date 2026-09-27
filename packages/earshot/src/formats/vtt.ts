/* WebVTT and SRT: captions in, captions out. A cue becomes a turn; VTT's voice tag
 * (`<v Agent>Hello`) names the speaker. Cues carry no word timings, so words are spread evenly
 * over the cue by their length, close enough to highlight along. */

import { createConversation } from "../core/conversation";
import type { Conversation, Word } from "../core/types";
import { type RoleMap, roleResolver } from "./roles";

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;

function seconds(text: string): number {
  const m = TIME.exec(text);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

function stamp(t: number, comma: boolean): string {
  const ms = Math.round(Math.max(0, t) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(ms % 1000, 3)}`;
}

/** Words spread over `[start, end]` by their length. */
export function spreadWords(text: string, start: number, end: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  let t = start;
  return parts.map((p) => {
    const d = ((p.length + 1) / total) * (end - start);
    const w = { text: p, start: t, end: t + d * 0.9 };
    t += d;
    return w;
  });
}

/** Parses WebVTT or SRT. Speakers come from VTT voice tags, or a leading `Name:` in SRT. */
export function fromCaptions(text: string, options: { roles?: RoleMap } = {}): Conversation {
  const role = roleResolver(options.roles);
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const turns = blocks.flatMap((block) => {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) return [];
    const [from, to] = lines[at]!.split("-->");
    const start = seconds(from!);
    const end = seconds(to!);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    let body = lines
      .slice(at + 1)
      .join(" ")
      .trim();
    let speaker: string | undefined;
    const voice = /^<v(?:\.[\w.-]+)?\s+([^>]+)>/.exec(body);
    if (voice) speaker = voice[1]!.trim();
    else {
      const named = /^([A-Z][\w .'-]{0,30}):\s/.exec(body);
      if (named) {
        speaker = named[1];
        body = body.slice(named[0].length);
      }
    }
    body = body.replace(/<[^>]+>/g, "").trim();
    return [
      {
        role: role(speaker),
        start,
        end,
        text: body,
        words: spreadWords(body, start, end),
        ...(speaker && { speaker }),
      },
    ];
  });
  return createConversation({ turns });
}

/** WebVTT with a voice tag per cue (the turn's speaker, else its role). */
export function toWebVTT(c: Conversation): string {
  const cues = c.turns.map(
    (t) => `${stamp(t.start, false)} --> ${stamp(t.end, false)}\n<v ${t.speaker ?? t.role}>${t.text}`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** SRT, the speaker as a `Name:` prefix. */
export function toSRT(c: Conversation): string {
  return (
    c.turns
      .map(
        (t, i) =>
          `${i + 1}\n${stamp(t.start, true)} --> ${stamp(t.end, true)}\n${t.speaker ?? t.role}: ${t.text}`,
      )
      .join("\n\n") + "\n"
  );
}
