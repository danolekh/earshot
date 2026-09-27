/* Films the teaser (apps/docs /stage/teaser) frame by frame and lays its audio under it.
 *
 *   pnpm --filter docs dev                       # the stage, on :3000 (or pass --url)
 *   pnpm --filter promo prepare-teaser           # the track and the features, once
 *   pnpm --filter promo record:teaser [--fast] [--url http://localhost:3000]
 *                                                # → out/teaser.mp4 (1920×1080, 60 fps, AAC)
 *
 * The page runs on a virtual clock (clock.js, from cardstock's recorder): after `start()` time
 * only moves when a frame is taken, so nothing drops however slow the capture. The final is shot at
 * 3840 wide and 120 fps and pairs are blended into 1080p60, which gives motion a light blur;
 * `--fast` shoots 1920 wide at 60 fps for a quick look. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const FAST = args.includes("--fast");
const VIEW = { width: 800, height: 450 };
const SCALE = (FAST ? 1920 : 3840) / VIEW.width;
const SAMPLES = 2;
const FPS = FAST ? 60 : 60 * SAMPLES;
const URL_ = new URL("/stage/teaser/", flag("url") ?? "http://localhost:3000").href;
const OUT = new URL("../out/", import.meta.url).pathname;
const TRACK = join(OUT, "teaser-track.f32");
const local = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

const browser = await chromium.launch({
  channel: "chromium",
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--force-color-profile=srgb",
    `--force-device-scale-factor=${SCALE}`,
  ],
});
const page = await browser.newPage({
  viewport: VIEW,
  deviceScaleFactor: SCALE,
  reducedMotion: "no-preference",
});
page.on("pageerror", (e) => console.error(e));
page.on("console", (m) => m.type() === "error" && console.error(m.text()));
await page.addInitScript({ content: local("clock.js") });
await page.goto(URL_);
await page.waitForSelector("html[data-ready]", { timeout: 60_000 });
await page.addStyleTag({
  content: "nextjs-portal, [data-nextjs-toast], #tanstack-devtools { display: none !important; }",
});
await new Promise((r) => setTimeout(r, 1500));
const duration: number = await page.evaluate(() => (window as any).__stage.duration);
const interval = 1000 / FPS;
const total = Math.ceil((duration * 1000) / interval);

const out = join(OUT, FAST ? "teaser-draft.mp4" : "teaser.mp4");
const filters = [
  ...(FAST ? [] : [`tmix=frames=${SAMPLES}`, "fps=60"]), // RGB to BT.709 limited range, the matrix the file is tagged with (the default is BT.601, which
  // shifts the blues).
  "scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv",
  "format=yuv420p",
];
const ffmpeg = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "png", "-framerate", String(FPS), "-i", "-"]
    .concat(["-f", "f32le", "-ar", "24000", "-ac", "1", "-i", TRACK])
    .concat(["-map", "0:v", "-map", "1:a", "-vf", filters.join(","), "-r", "60"])
    .concat(["-c:v", "libx264", "-preset", "slow", "-crf", FAST ? "18" : "12", "-profile:v", "high"])
    .concat([
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
    ])
    .concat(["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out]),
  { stdio: ["pipe", "inherit", "inherit"] },
);
const done = new Promise((resolve) => ffmpeg.on("exit", resolve));

// From here the page's clocks only move when a frame is taken; the stage's own clock starts at
// frame zero, with the audio.
await page.evaluate(() => {
  (window as any).__clock.start();
  (window as any).__stage.play();
});
const started = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((ms) => (window as any).__clock.step(ms), interval);
  const png = await page.screenshot({ type: "png", scale: "device", animations: "allow", caret: "initial" });
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % FPS === 0) process.stdout.write(`\r${Math.round((i / total) * 100)}%`);
}
ffmpeg.stdin.end();
await done;
await browser.close();
console.log(`\r${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s → ${out}`);
