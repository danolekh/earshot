/* Cuts a recorded master (out/<take>[-<theme>].mp4) down for the web.
 *
 *   pnpm --filter promo encode <master.mp4> <name> --out <dir> [--cover <dir>] [--x] [--poster <s>]
 *
 * Writes into --out:
 *   <name>-1600.mp4          1600×900, for a hero
 *   <name>-800.mp4           800×450, for a preview in a grid card
 *   <name>-poster.webp       frame 0 (the loop's start), 1600 wide, so the poster and the video's
 *   <name>-poster-800.webp   first frame match; and an 800 wide cut
 * and with --cover, the posters again as <dir>/<name>.webp and <name>-800.webp, the project-cover
 * naming on danolekh.com; and with --x, <name>-x.mp4 for a post on X: the full 1920×1080 at 60fps,
 * at a higher quality than the web cuts (X re-encodes whatever it gets, so it should get a lot to
 * work from), well inside its 512 MB and 2:20 limits. `--poster <s>` takes the posters from that
 * second instead of frame 0, for a video that doesn't open on its best frame. H.264 High in yuv420p
 * with the index up front. The call's sound stays in every cut (AAC): the pages play them muted and
 * inline, and a viewer can turn the sound on. From cardstock's recorder. */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const [master, name] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = flag("out");
if (!master || !name || !out)
  throw new Error("usage: encode <master.mp4> <name> --out <dir> [--cover <dir>] [--x]");
mkdirSync(out, { recursive: true });

const mb = (file: string) => `${(statSync(file).size / 1e6).toFixed(1)} MB`;

for (const [width, crf] of [
  [1600, 23],
  [800, 25],
] as const) {
  const file = join(out, `${name}-${width}.mp4`);
  execFileSync("ffmpeg", [
    ...["-y", "-loglevel", "error", "-i", master, "-c:a", "aac", "-b:a", "128k"],
    ...["-vf", `scale=${width}:-2:flags=lanczos,format=yuv420p`],
    ...["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high"],
    ...["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"],
    ...["-movflags", "+faststart", file],
  ]);
  console.log(`${file}  ${mb(file)}`);
}

if (args.includes("--x")) {
  const file = join(out, `${name}-x.mp4`);
  execFileSync("ffmpeg", [
    ...["-y", "-loglevel", "error", "-i", master, "-c:a", "aac", "-b:a", "192k"],
    ...["-vf", "scale=1920:1080:flags=lanczos,fps=60,format=yuv420p"],
    ...["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.2"],
    ...["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"],
    ...["-movflags", "+faststart", file],
  ]);
  console.log(`${file}  ${mb(file)}`);
}

// Frame 0 (or --poster's) as a lossless PNG, then webp at both widths.
const frame = execFileSync("ffmpeg", [
  ...[
    "-loglevel",
    "error",
    ...(flag("poster") ? ["-ss", flag("poster")!] : []),
    "-i",
    master,
    "-frames:v",
    "1",
  ],
  ...["-f", "image2pipe", "-c:v", "png", "-"],
]);
const posters: [string, number][] = [
  [join(out, `${name}-poster.webp`), 1600],
  [join(out, `${name}-poster-800.webp`), 800],
];
const cover = flag("cover");
if (cover) {
  mkdirSync(cover, { recursive: true });
  posters.push([join(cover, `${name}.webp`), 1600], [join(cover, `${name}-800.webp`), 800]);
}
for (const [file, width] of posters) {
  await sharp(frame).resize(width).webp({ quality: 88 }).toFile(file);
  console.log(`${file}  ${mb(file)}`);
}
