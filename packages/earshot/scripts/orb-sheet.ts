/* A contact sheet of the orb in every state, drawn by the built library's own WebGL code
 * in headless Chrome, on dark and light: out/orb-sheet.png. For looking at a change to a shader
 * instead of guessing.
 *
 *   pnpm --filter @danolekh/earshot build && node scripts/orb-sheet.ts [--size 220] [--level 0.7]
 *   node scripts/orb-sheet.ts --motion     frames over time: idle, listening, thinking, speaking
 *
 * Needs Google Chrome (or CHROME=/path/to/chrome). */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";

const here = (p: string) => new URL(p, import.meta.url).pathname;
const ROOTS: Record<string, string> = {
  dist: here("../dist/"),
  gl: here("../node_modules/@danolekh/gl/dist/"),
  math: here("../node_modules/math/dist/"),
};
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const SIZE = arg("size", 220);
const LEVEL = arg("level", 0.7);
const MOTION = process.argv.includes("--motion");

const page = `<!doctype html><html><head><script type="importmap">{"imports":{
  "@danolekh/gl":"/gl/index.js","math/time":"/math/time/index.js","math/noise":"/math/noise/index.js"}}</script>
</head><body><pre id="out"></pre><script type="module">
import { createBackend, resolveParams } from "@danolekh/gl";
import { ORB } from "/dist/orb/presets.js";
import { createOrbDriver } from "/dist/orb/driver.js";
window.addEventListener("error", (e) => { document.getElementById("out").textContent = "@@" + JSON.stringify({ error: String(e.message) }) + "@@"; });
window.addEventListener("unhandledrejection", (e) => { document.getElementById("out").textContent = "@@" + JSON.stringify({ error: String(e.reason) }) + "@@"; });
const S = ${SIZE}, MOTION = ${MOTION};
// Motion: 12 frames through a scripted sequence; stills: one frame per state.
const script = (t) => (t < 1 ? "idle" : t < 2.6 ? "listening" : t < 3.6 ? "thinking" : "speaking");
// A voice-like source: ~4.5 syllables a second, each with an onset, cycling open, round and spread
// vowels, a hiss every fifth syllable.
const voice = (t) => {
  const s = t * 4.5, p = s % 1, n = Math.floor(s);
  const level = Math.sin(Math.PI * p) ** 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.1))) * ${LEVEL} / 0.7;
  const v = n % 3;
  return { level, centroid: 0.5, sibilance: n % 5 === 0 ? 0.7 * level : 0, low: 0.3 * level, mid: 0.6 * level,
    high: 0.2 * level, open: v === 0 ? level : 0, round: v === 1 ? level : 0, spread: v === 2 ? level : 0,
    onset: p < 0.08 ? 0.8 : 0 };
};
const states = MOTION ? Array.from({ length: 12 }, (_, i) => (i * 0.45).toFixed(2)) : ["idle", "listening", "thinking", "speaking"];
const presets = [ORB];
const backend = createBackend();
const out = {};
if (!backend) out.error = "no WebGL2";
const sheet = document.createElement("canvas");
sheet.width = S * states.length * (MOTION ? 1 : 2);
sheet.height = S * presets.length;
const g = sheet.getContext("2d");
g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, S * states.length, sheet.height);
g.fillStyle = "#f4f5f7"; g.fillRect(S * states.length, 0, S * states.length, sheet.height);
for (const [row, def] of presets.entries()) {
  if (!backend) break;
  let state = backend.prepare(def);
  for (let i = 0; state === "pending" && i < 20000; i++) { await new Promise((r) => setTimeout(r, 5)); state = backend.prepare(def); }
  if (state !== "ready") { out[def.id] = String(state); continue; }
  if (state instanceof Error) { out[def.id] = state.message; continue; }
  for (const [col, name] of states.entries()) {
    let t = 0;
    const driver = createOrbDriver(() => t);
    const level = { level: () => voice(t / 1000).level, features: () => voice(t / 1000) };
    const frames = MOTION ? Math.round(Number(name) * 60) : 150;
    driver.configure({ state: MOTION ? "idle" : name, input: level, output: level, reducedMotion: false });
    let s = driver.sample();
    for (let f = 0; f < frames; f++) {
      t += 1000 / 60;
      if (MOTION) driver.configure({ state: script(t / 1000), input: level, output: level, reducedMotion: false });
      s = driver.sample();
    }
    const c = document.createElement("canvas");
    const ok = backend.draw(def, { width: S * 2, height: S * 2, pixelRatio: 2, time: 0, pointer: [0.5, 0.5], inputs: s,
      seed: 0.37, frame: 0, uniforms: resolveParams(def, undefined) }, c.getContext("2d"));
    if (!ok) out[def.id] = "didn't draw";
    g.drawImage(c, col * S, row * S, S, S);
    if (!MOTION) g.drawImage(c, (states.length + col) * S, row * S, S, S);
  }
  out[def.id] = "ok";
}
g.font = "12px monospace";
for (const [col, name] of states.entries()) {
  const label = MOTION ? name + "s " + script(Number(name)) : name;
  g.fillStyle = "#9aa1ab"; g.fillText(label, col * S + 8, 16);
  g.fillStyle = "#555"; g.fillText(label, (states.length + col) * S + 8, 16);
}
out.png = sheet.toDataURL("image/png");
document.getElementById("out").textContent = "@@" + JSON.stringify(out) + "@@";
</script></body></html>`;

const TYPES: Record<string, string> = { ".js": "text/javascript", ".html": "text/html" };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  const [, key, ...rest] = url.pathname.split("/");
  const root = ROOTS[key ?? ""];
  const path = root && normalize(join(root, rest.join("/")));
  if (!root || !path || !path.startsWith(root) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const port = (server.address() as AddressInfo).port;
let json: string | undefined;
try {
  for (let attempt = 0; attempt < 3 && !json; attempt++) {
    const { stdout } = await promisify(execFile)(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu-sandbox",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
        "--virtual-time-budget=60000",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ],
      { encoding: "utf8", maxBuffer: 1 << 30 },
    );
    json = /<pre id="out">@@(.*)@@<\/pre>/s.exec(stdout)?.[1];
  }
} finally {
  server.close();
}
if (!json)
  throw new Error("Chrome didn't finish the page. Run it again; a cold Chrome sometimes runs out of time.");
const out = JSON.parse(
  json.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"'),
);
if (out.error) throw new Error(`the page failed: ${out.error}`);
const { png, ...status } = out;
console.log(status);
mkdirSync(here("../out/"), { recursive: true });
writeFileSync(
  here(MOTION ? "../out/orb-motion.png" : "../out/orb-sheet.png"),
  Buffer.from(String(png).split(",")[1]!, "base64"),
);
console.log(MOTION ? "out/orb-motion.png" : "out/orb-sheet.png");
