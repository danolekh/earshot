/* A short film of the orb with real voices, for judging its motion rather than stills: idle, then
 * listening to a caller's line, a thinking pause, the agent's reply, idle again. The loudness of
 * the actual audio drives it frame by frame, the frames are drawn by the built library's own WebGL
 * code in headless Chrome, and the audio is laid under them: out/orb-video.mp4.
 *
 *   pnpm --filter @danolekh/earshot build && node scripts/orb-video.ts [--size 640] [--fps 30] [--liveliness 1]
 *   node scripts/orb-video.ts --compare     three orbs side by side, liveliness 0.8 / 1.2 / 1.6
 *
 * The voice's features (loudness, brightness, onsets, hiss) are worked out from the audio itself,
 * by the library's own feature tracker over an FFT of each frame's window.
 *
 * Needs the demo calls built (node calls/build.ts), ffmpeg, and Google Chrome. */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

import { analyse, decode as decodeAudio } from "./analyse.ts";

const here = (p: string) => new URL(p, import.meta.url).pathname;
const CALLS = here("../../../calls/out/");
const OUT = here("../out/");
const FRAMES = join(OUT, "orb-frames");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const SIZE = arg("size", 640);
const FPS = arg("fps", 30);
const RATE = 24000;
const COMPARE = process.argv.includes("--compare");
const LIVES = COMPARE ? [0.8, 1.2, 1.6] : [arg("liveliness", 1)];
const NAME = COMPARE ? "orb-compare" : "orb-video";

// The soundtrack: silence, the caller's first line, a pause, the agent's reply, silence.
const call = JSON.parse(readFileSync(join(CALLS, "alder-mutual-address.json"), "utf8"));
const ask = call.turns.find((t: { role: string }) => t.role === "user");
const reply = JSON.parse(readFileSync(join(CALLS, "reply-2.json"), "utf8")).turns[0];
const decode = (file: string, from = 0, to?: number) => decodeAudio(file, RATE, from, to);
const silence = (s: number) => new Float32Array(Math.round(s * RATE));
const segments: { role: "idle" | "listening" | "thinking" | "speaking"; samples: Float32Array }[] = [
  { role: "idle", samples: silence(1.2) },
  {
    role: "listening",
    samples: decode(join(CALLS, "alder-mutual-address.mp3"), ask.start - 0.05, ask.end + 0.1),
  },
  { role: "thinking", samples: silence(1.4) },
  { role: "speaking", samples: decode(join(CALLS, "reply-2.mp3"), reply.start - 0.05, reply.end + 0.1) },
  { role: "idle", samples: silence(1.2) },
];
const total = segments.reduce((n, s) => n + s.samples.length, 0);
const track = new Float32Array(total);
const frames: { state: string; features: Record<string, number> }[] = [];
let at = 0;
for (const seg of segments) {
  track.set(seg.samples, at);
  at += seg.samples.length;
}
// Per frame: the state, and the voice's features from the audio itself (./analyse.ts).
const features = await analyse(track, RATE, FPS);
features.forEach((f, i) => {
  const end = Math.round(((i + 1) / FPS) * RATE);
  let pos = 0;
  let state = "idle";
  for (const seg of segments) {
    if (end <= pos + seg.samples.length) {
      state = seg.role;
      break;
    }
    pos += seg.samples.length;
  }
  frames.push({ state, features: f });
});

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
writeFileSync(join(OUT, "orb-track.f32"), Buffer.from(track.buffer));

const ROOTS: Record<string, string> = {
  dist: here("../dist/"),
  gl: here("../node_modules/@danolekh/gl/dist/"),
  math: here("../node_modules/math/dist/"),
};
const page = `<!doctype html><html><head><script type="importmap">{"imports":{
  "@danolekh/gl":"/gl/index.js","math/time":"/math/time/index.js","math/noise":"/math/noise/index.js"}}</script>
</head><body><pre id="out"></pre><script type="module">
import { createBackend, resolveParams } from "@danolekh/gl";
import { ORB } from "/dist/orb/presets.js";
import { createOrbDriver } from "/dist/orb/driver.js";
const frames = ${JSON.stringify(frames)}, S = ${SIZE}, FPS = ${FPS}, LIVES = ${JSON.stringify(LIVES)};
const backend = createBackend();
let state = backend.prepare(ORB);
for (let i = 0; state === "pending" && i < 20000; i++) { await new Promise((r) => setTimeout(r, 5)); state = backend.prepare(ORB); }
if (state !== "ready") { await fetch("/fail", { method: "POST", body: String(state) }); throw new Error(String(state)); }
let t = 0, f = 0;
const src = { level: () => frames[f].features.level, features: () => frames[f].features };
const drivers = LIVES.map(() => createOrbDriver(() => t));
const out = document.createElement("canvas");
out.width = S * LIVES.length;
out.height = S;
const g = out.getContext("2d");
const shot = document.createElement("canvas");
for (f = 0; f < frames.length; f++) {
  t = (f / FPS) * 1000;
  const heard = frames[f].state === "listening";
  g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, out.width, S);
  drivers.forEach((driver, k) => {
    driver.configure({ state: frames[f].state, input: heard ? src : undefined, output: heard ? undefined : src,
      reducedMotion: false, liveliness: LIVES[k] });
    const s = driver.sample();
    backend.draw(ORB, { width: S, height: S, pixelRatio: 1, time: t / 1000, pointer: [0.5, 0.5], inputs: s, seed: 0.37,
      frame: f, uniforms: resolveParams(ORB, undefined) }, shot.getContext("2d"));
    g.drawImage(shot, k * S, 0);
    g.fillStyle = "#6b7280"; g.font = "16px monospace";
    if (LIVES.length > 1) g.fillText("ABC"[k] + "  liveliness " + LIVES[k], k * S + 20, 34);
  });
  g.fillText(frames[f].state, 20, S - 22);
  const blob = await new Promise((r) => out.toBlob(r, "image/png"));
  await fetch("/frame/" + f, { method: "POST", body: blob });
}
document.getElementById("out").textContent = "@@done@@";
</script></body></html>`;

const TYPES: Record<string, string> = { ".js": "text/javascript", ".html": "text/html" };
let received = 0;
let failure = "";
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  if (req.method === "POST" && url.pathname === "/fail") {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      failure = Buffer.concat(parts).toString();
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/frame/")) {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      const n = Number(url.pathname.slice(7));
      writeFileSync(join(FRAMES, `${String(n).padStart(5, "0")}.png`), Buffer.concat(parts));
      received++;
      res.writeHead(204).end();
    });
    return;
  }
  const [, key, ...rest] = url.pathname.split("/");
  const root = ROOTS[key ?? ""];
  const path = root && normalize(join(root, rest.join("/")));
  if (!root || !path || !path.startsWith(root) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const port = (server.address() as AddressInfo).port;
// Real time, not virtual: the frames are sent back as they're drawn.
const chrome = spawn(CHROME, [
  "--headless=new",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--remote-debugging-port=0",
  `http://127.0.0.1:${port}/`,
]);
const started = Date.now();
while (received < frames.length && Date.now() - started < 15 * 60_000)
  await new Promise((r) => setTimeout(r, 500));
chrome.kill();
server.close();
if (failure) throw new Error(`the orb didn't compile:\n${failure}`);
if (received < frames.length) throw new Error(`only ${received} of ${frames.length} frames arrived`);

execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-framerate",
  String(FPS),
  "-i",
  join(FRAMES, "%05d.png"),
  "-f",
  "f32le",
  "-ar",
  String(RATE),
  "-ac",
  "1",
  "-i",
  join(OUT, "orb-track.f32"),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "18",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-shortest",
  join(OUT, `${NAME}.mp4`),
]);
rmSync(join(OUT, "orb-track.f32"));
console.log(`out/${NAME}.mp4: ${frames.length} frames, ${(frames.length / FPS).toFixed(1)} s`);
