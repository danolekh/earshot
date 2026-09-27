/* Films the call debugger frame by frame. A take is a script (takes.ts) that drives this: it opens
 * pages, moves the cursor to what it measures on the page as it gets there, presses keys, plays
 * stretches of the call, and puts captions and a closing card over it.
 *
 * The page runs on the recorder's virtual clock (clock.js): after `begin()` its time moves only
 * when a frame is taken, each frame one interval, screenshotted into ffmpeg, so nothing drops
 * however slow the capture. The debugger's stage build (apps/debugger `build:stage`) plays calls
 * on that clock instead of an <audio> element and logs every play, seek and stop; `end()` hands
 * that log to mux.ts, which lays the call's own recording under the video. A look (looks.ts)
 * dresses it for where the film goes: CSS over the app, and a backdrop it's composited onto. */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";

import { type Browser, chromium, type Page } from "playwright";

import type { Look } from "./looks.ts";

export type Point = [number, number];
export type Ease = (t: number) => number;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface AudioEvent {
  at: number;
  callId: string;
  kind: "play" | "seek" | "stop" | "mix";
  t: number;
  /** `mix`: each file channel's gain after a mute or solo. */
  gains?: [number, number];
}

export interface Filmed {
  /** The video with no sound yet. */
  video: string;
  events: AudioEvent[];
  /** The page's time (ms) when filming began, and one frame's length. */
  start: number;
  interval: number;
  /** Seconds. */
  duration: number;
}

export interface FilmOptions {
  theme: "dark" | "light";
  fast: boolean;
  /** The CSS size filmed, 1920×1080 by default (a real screen, where the findings and the details
   * both fit); the frames are 3840 wide (1920 with `fast`). A look sets its window's size. */
  view?: { width: number; height: number };
  look?: Look;
  /** Frames blended into each output frame in the final (2: shot at 120 fps). */
  samples?: number;
  accent?: string;
}

const STAGE = new URL("../../debugger/.output-stage/public/", import.meta.url).pathname;
const local = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain",
};

/** The stage build's prerendered pages and assets, as the host serves them (`/call/x/` is
 * `/call/x/index.html`). */
function serve(): Promise<{ server: Server; origin: string }> {
  if (!existsSync(STAGE)) throw new Error("no stage build: run `pnpm --filter debugger build:stage`");
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = join(STAGE, path);
    if (!file.startsWith(STAGE)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    else if (!existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    }),
  );
}

export class Film {
  readonly page: Page;
  readonly interval: number;
  readonly fps: number;
  private readonly browser: Browser;
  private readonly server: Server;
  private readonly origin: string;
  private readonly fast: boolean;
  private readonly samples: number;
  private readonly scale: number;
  private readonly look?: Look;
  private ffmpeg?: ChildProcess;
  private out = "";
  private frames = 0;
  private started = 0;
  private pos: Point;
  private readonly size: { width: number; height: number };
  private down = false;
  private events: AudioEvent[] = [];
  private errors: string[] = [];

  private constructor(o: {
    page: Page;
    browser: Browser;
    server: Server;
    origin: string;
    fast: boolean;
    samples: number;
    scale: number;
    look?: Look;
    view: { width: number; height: number };
  }) {
    this.page = o.page;
    this.browser = o.browser;
    this.server = o.server;
    this.origin = o.origin;
    this.fast = o.fast;
    this.samples = o.samples;
    this.scale = o.scale;
    this.look = o.look;
    this.fps = o.fast ? 60 : 60 * o.samples;
    this.interval = 1000 / this.fps;
    this.size = o.view;
    this.pos = [o.view.width + 60, o.view.height - 60];
  }

  static async open(options: FilmOptions): Promise<Film> {
    const { look } = options;
    const view = look
      ? { width: look.window.width, height: look.window.height }
      : (options.view ?? { width: 1920, height: 1080 });
    const samples = options.samples ?? 2;
    // A look's window is filmed at the full frame's scale, so its text is the size it'd be full frame.
    const scale = (options.fast ? 1920 : 3840) / (look ? 1920 : view.width);
    const { server, origin } = await serve();
    const browser = await chromium.launch({
      channel: "chromium",
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--force-color-profile=srgb",
        `--force-device-scale-factor=${scale}`,
      ],
    });
    const page = await browser.newPage({
      viewport: view,
      deviceScaleFactor: scale,
      reducedMotion: "no-preference",
      colorScheme: options.theme,
    });
    const film = new Film({ page, browser, server, origin, fast: options.fast, samples, scale, look, view });
    page.on("pageerror", (e) => film.errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && film.errors.push(m.text()));
    // Once per page load: the theme, a fresh debugger (no remembered lanes or tests), the stage log.
    await page.addInitScript((theme) => {
      if (!sessionStorage.getItem("promo")) {
        for (const k of Object.keys(localStorage)) if (k.startsWith("debugger:")) localStorage.removeItem(k);
        localStorage.setItem("debugger:theme", theme);
        sessionStorage.setItem("promo", "1");
      }
      (window as unknown as { __stage: unknown }).__stage = { audio: [] };
    }, options.theme);
    await page.addInitScript({ content: local("clock.js") });
    if (look)
      await page.addInitScript(
        ({ css, overlay }) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
          (window as any).__overlayLook = overlay;
        },
        { css: look.css, overlay: look.overlay },
      );
    await page.addInitScript(
      (accent) => ((window as any).__cursorAccent = accent),
      options.accent ?? look?.accent ?? "#c6ff3d",
    );
    await page.addInitScript({ content: local("cursor.js") });
    await page.addInitScript({ content: local("overlay.js") });
    return film;
  }

  /** Loads a page, in real time. Only before `begin()`: a full load resets the page's clock. A call
   * page is ready when the debugger says so; any other when its network settles. */
  async goto(path: string): Promise<void> {
    if (this.ffmpeg) throw new Error("goto after begin: navigate by clicking instead");
    await this.page.goto(this.origin + path);
    if (path.startsWith("/call/"))
      await this.page.waitForSelector("html[data-stage-ready]", { state: "attached", timeout: 30_000 });
    else await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(600);
  }

  /** Loads each page once before filming, so its code and call are cached when the take opens it. */
  async warm(paths: string[]): Promise<void> {
    for (const p of paths) await this.goto(p);
  }

  /** Starts filming into `out` (no sound). From here the page's time only moves frame by frame. */
  async begin(out: string): Promise<void> {
    this.out = out;
    const filters = [
      ...(this.fast ? [] : [`tmix=frames=${this.samples}`, "fps=60"]),
      "scale=1920:1080:flags=lanczos",
      "format=yuv420p",
    ];
    // With a look, each frame goes into its window on the backdrop (a still, looped until the
    // frames end), then on as before.
    let input = ["-vf", filters.join(",")];
    const backdrop = out.replace(/\.mp4$/, ".backdrop.png");
    if (this.look) {
      const s = this.scale;
      const { x, y } = this.look.window;
      writeFileSync(backdrop, await this.look.backdrop(s));
      const graph = [
        `[0:v]pad=${1920 * s}:${1080 * s}:${x * s}:${y * s}[framed]`,
        `[framed][1:v]overlay=0:0:shortest=1:format=rgb,${filters.join(",")}[v]`,
      ].join(";");
      input = [
        "-loop",
        "1",
        "-framerate",
        String(this.fps),
        "-i",
        backdrop,
        "-filter_complex",
        graph,
        "-map",
        "[v]",
      ];
    }
    this.ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-c:v",
        "png",
        "-framerate",
        String(this.fps),
        "-i",
        "-",
      ]
        .concat(input, ["-r", "60"])
        .concat(["-c:v", "libx264", "-preset", this.fast ? "medium" : "slow"])
        .concat(["-crf", this.fast ? "18" : "12", "-profile:v", "high"])
        .concat(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"])
        .concat(["-color_range", "tv", "-movflags", "+faststart", out]),
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    this.started = await this.page.evaluate(() => {
      (window as any).__clock.start();
      return performance.now();
    });
  }

  /** One frame: the clock moves one interval, then the screenshot. */
  async frame(): Promise<void> {
    await this.page.evaluate((ms) => (window as any).__clock.step(ms), this.interval);
    const png = await this.page.screenshot({
      type: "png",
      scale: "device",
      animations: "allow",
      caret: "initial",
    });
    const stdin = this.ffmpeg!.stdin!;
    if (!stdin.write(png)) await new Promise((r) => stdin.once("drain", r));
    this.frames++;
    if (this.frames % this.fps === 0) process.stdout.write(`\r${(this.frames / this.fps).toFixed(0)} s`);
  }

  async hold(ms: number): Promise<void> {
    for (let i = Math.round(ms / this.interval); i > 0; i--) await this.frame();
  }

  async move(to: Point, ms: number, ease: Ease = easeInOut): Promise<void> {
    const [x0, y0] = this.pos;
    const n = Math.max(1, Math.round(ms / this.interval));
    for (let i = 1; i <= n; i++) {
      const e = ease(i / n);
      this.pos = [x0 + (to[0] - x0) * e, y0 + (to[1] - y0) * e];
      await this.page.mouse.move(this.pos[0], this.pos[1]);
      await this.frame();
    }
  }

  /** Moves to the middle of what `selector` matches now (or `at`, fractions of its box). */
  async moveTo(selector: string, ms = 700, at: Point = [0.5, 0.5]): Promise<void> {
    const target = this.page.locator(selector).first();
    await target.scrollIntoViewIfNeeded({ timeout: 5000 });
    const box = await target.boundingBox();
    if (!box) throw new Error(`nothing to move to: ${selector}`);
    await this.move([box.x + box.width * at[0], box.y + box.height * at[1]], ms);
  }

  /** Takes the cursor off the frame (before a closing card, say). */
  async away(ms = 500): Promise<void> {
    await this.move([this.size.width + 80, this.size.height - 40], ms);
    await this.page.evaluate(() => (window as any).__cursor?.hide());
  }

  async click(hold = 110): Promise<void> {
    await this.page.mouse.down();
    this.down = true;
    await this.hold(hold);
    await this.page.mouse.up();
    this.down = false;
  }

  /** Presses a key, with its keycap shown. */
  async press(key: string, label = key): Promise<void> {
    await this.page.evaluate((l) => (window as any).__overlay.key(l), label);
    await this.page.keyboard.press(key);
  }

  async caption(text: string | null): Promise<void> {
    await this.page.evaluate((t) => (window as any).__overlay.caption(t), text);
  }

  async card(card: { eyebrow?: string; title: string; subtitle?: string; lines?: string[] }): Promise<void> {
    await this.page.evaluate((c) => (window as any).__overlay.card(c), card);
  }

  /** Films frames until `selector` is on the page (a page loading after a click). */
  async until(selector: string, maxMs = 5000): Promise<void> {
    for (let t = 0; t < maxMs; t += this.interval) {
      if ((await this.page.locator(selector).count()) > 0) return;
      await this.frame();
    }
    throw new Error(`never appeared: ${selector}`);
  }

  /** Plays the call on this page from `from` to `to` seconds (the sound comes from the log). */
  async play(from: number, to: number): Promise<void> {
    await this.page.evaluate((t) => {
      const clock = (window as any).__stage.clock;
      clock.seek(t);
      clock.play();
    }, from);
    await this.hold((to - from) * 1000);
    await this.page.evaluate(() => (window as any).__stage.clock.pause());
  }

  /** Starts the call playing from `from` and returns at once, so the take can move on while it
   * plays; `pause()` stops it. */
  async playFrom(from: number): Promise<void> {
    await this.page.evaluate((t) => {
      const clock = (window as any).__stage.clock;
      clock.seek(t);
      clock.play();
    }, from);
  }

  async pause(): Promise<void> {
    await this.page.evaluate(() => (window as any).__stage.clock.pause());
  }

  /** Where on the screen time `t` is right now, over the timeline's lanes. */
  async xAt(t: number): Promise<number> {
    return this.page.evaluate((time) => {
      const v = (window as any).__stage.viewport.get();
      const box = document.querySelector("[data-slot=timeline-scrubber]")!.getBoundingClientRect();
      return box.left + ((time - v.from) / (v.to - v.from)) * box.width;
    }, t);
  }

  /** The view (seconds) and the scrubber's box, for aiming a zoom or a pan. */
  async view(): Promise<{
    from: number;
    to: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }> {
    return this.page.evaluate(() => {
      const v = (window as any).__stage.viewport.get();
      const b = document.querySelector("[data-slot=timeline-scrubber]")!.getBoundingClientRect();
      return { from: v.from, to: v.to, left: b.left, top: b.top, width: b.width, height: b.height };
    });
  }

  /** Zooms the timeline by `factor` (under 1 zooms in) at `at`, the way a person does: Ctrl and the
   * wheel, a small step every frame, so it glides. */
  async wheelZoom(at: Point, factor: number, ms: number): Promise<void> {
    await this.move(at, 350);
    const n = Math.max(1, Math.round(ms / this.interval));
    const dy = Math.log(factor) / (0.01 * n);
    await this.page.keyboard.down("Control");
    for (let i = 0; i < n; i++) {
      await this.page.mouse.wheel(0, dy);
      await this.frame();
    }
    await this.page.keyboard.up("Control");
  }

  /** Pans the timeline to start at `from` seconds, with Shift and the wheel, over `ms`. The pointer
   * must be over the lanes. */
  async wheelPan(from: number, ms: number): Promise<void> {
    const v = await this.view();
    const px = ((from - v.from) / (v.to - v.from)) * v.width;
    const n = Math.max(1, Math.round(ms / this.interval));
    await this.page.keyboard.down("Shift");
    for (let i = 0; i < n; i++) {
      // Eased: most of the travel in the middle frames.
      const w = (Math.cos((Math.PI * i) / n) - Math.cos((Math.PI * (i + 1)) / n)) / 2;
      await this.page.mouse.wheel(0, px * w);
      await this.frame();
    }
    await this.page.keyboard.up("Shift");
  }

  /** Punches in on `rect` (CSS px of the page), or back out with null, over `ms`: the app scales
   * and moves under the captions and the cursor, which stay as they are. Text stays sharp. On a
   * page without the call's shell (Tests), the page's root moves; the overlays sit after it. */
  async camera(rect: { x: number; y: number; w: number; h: number } | null, ms = 700): Promise<void> {
    await this.page.evaluate(
      ({ box, duration, view }) => {
        const root =
          document.querySelector<HTMLElement>("[data-slot=sidebar-wrapper]") ??
          (document.body.firstElementChild as HTMLElement);
        root.style.transformOrigin = "0 0";
        root.style.transition = `transform ${duration}ms cubic-bezier(0.45, 0, 0.2, 1)`;
        if (!box) {
          root.style.transform = "translate(0px, 0px) scale(1)";
          return;
        }
        const s = Math.min(view.width / box.w, view.height / box.h);
        const x = -box.x * s + (view.width - box.w * s) / 2;
        const y = -box.y * s + (view.height - box.h * s) / 2;
        root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      },
      { box: rect, duration: ms, view: this.size },
    );
    await this.hold(ms);
  }

  /** Stops filming: closes the video and returns what the audio needs. */
  async end(): Promise<Filmed> {
    this.events.push(...(await this.page.evaluate(() => (window as any).__stage.audio as AudioEvent[])));
    const ffmpeg = this.ffmpeg!;
    const done = new Promise((r) => ffmpeg.on("exit", r));
    ffmpeg.stdin!.end();
    await done;
    if (this.look) rmSync(this.out.replace(/\.mp4$/, ".backdrop.png"), { force: true });
    process.stdout.write("\n");
    await this.browser.close();
    this.server.close();
    if (this.errors.length) throw new Error(`the page logged errors:\n${this.errors.join("\n")}`);
    return {
      video: this.out,
      events: this.events,
      start: this.started,
      interval: this.interval,
      duration: this.frames / this.fps,
    };
  }

  /** Stops after a failure, keeping what was filmed so far (silent) to look at. */
  async abort(): Promise<void> {
    if (this.ffmpeg) {
      const done = new Promise((r) => this.ffmpeg!.on("exit", r));
      this.ffmpeg.stdin!.end();
      await done;
      console.error(`\nkept what was filmed: ${this.out}`);
    }
    await this.browser.close().catch(() => {});
    this.server.close();
  }
}
