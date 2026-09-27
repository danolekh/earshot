/* Lays a call's own recording under a filmed take: every stretch the page played (from the stage
 * build's play, seek and stop log) is cut from that call's recording and placed at the moment it
 * played in the video. The video is copied, not re-encoded.
 *
 * Times: the page logs each event at its own clock (ms), which only moved one frame interval per
 * frame from `start`. An event at `at` shows from the next frame on, and that frame already shows
 * the call one interval later, so the sound for a play at `at` starts in the video at
 * `at - start - interval`, reading from where the call was. */
import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

import type { Filmed } from "./film.ts";

const CALLS = new URL("../../debugger/public/calls/", import.meta.url).pathname;

export interface Segment {
  callId: string;
  /** Where it starts in the video, and the stretch of the call (seconds). */
  at: number;
  from: number;
  to: number;
}

export function segments(filmed: Filmed): Segment[] {
  const out: Segment[] = [];
  let open: { callId: string; at: number; from: number } | undefined;
  const close = (at: number) => {
    if (!open) return;
    const length = (at - open.at) / 1000;
    if (length > 0.02)
      out.push({ callId: open.callId, at: open.at, from: open.from, to: open.from + length });
    open = undefined;
  };
  for (const e of filmed.events) {
    if (e.kind === "stop") close(e.at);
    else if (e.kind === "play" || open) {
      close(e.at);
      open = { callId: e.callId, at: e.at, from: e.t };
    }
  }
  close(filmed.start + filmed.duration * 1000 + filmed.interval);
  return out.map((s) => ({ ...s, at: Math.max(0, (s.at - filmed.start - filmed.interval) / 1000) }));
}

/** Writes the video with its sound in place of the silent one. Each stretch reads the recording
 * through its own input, seeked to where it starts: one input shared by stretches that overlap in
 * the call makes ffmpeg's mix run on without end. */
export function mux(filmed: Filmed, out: string): Segment[] {
  const segs = segments(filmed);
  const inputs = segs.flatMap((s) => {
    const file = `${CALLS}${s.callId}/call.mp3`;
    if (!existsSync(file)) throw new Error(`no recording for ${s.callId}: ${file}`);
    return ["-ss", s.from.toFixed(4), "-t", (s.to - s.from).toFixed(4), "-i", file];
  });
  const fade = 0.008;
  const parts = segs.map((s, k) => {
    const len = s.to - s.from;
    return (
      `[${k + 1}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      // Caller left and agent right in the file; brought a little closer for headphones.
      "pan=stereo|c0=0.75*c0+0.25*c1|c1=0.25*c0+0.75*c1," +
      `afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade).toFixed(4)}:d=${fade},` +
      `adelay=${Math.round(s.at * 1000)}:all=1[a${k}]`
    );
  });
  const end = filmed.duration.toFixed(3);
  const graph = segs.length
    ? `${parts.join(";")};${segs.map((_, k) => `[a${k}]`).join("")}amix=inputs=${segs.length}:normalize=0:duration=longest,apad=whole_dur=${end}[out]`
    : `anullsrc=r=48000:cl=stereo,atrim=end=${end}[out]`;
  const tmp = `${out}.tmp.mp4`;
  execFileSync("ffmpeg", [
    ...["-y", "-loglevel", "error", "-i", filmed.video, ...inputs],
    ...["-filter_complex", graph, "-map", "0:v", "-map", "[out]"],
    ...["-c:v", "copy", "-c:a", "aac", "-b:a", "192k"],
    // Bounded by the video's length whatever the audio graph does.
    ...["-t", end, "-movflags", "+faststart", tmp],
  ]);
  renameSync(tmp, out);
  return segs;
}
