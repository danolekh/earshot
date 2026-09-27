/* How a film is dressed for where it goes. Without a look it's the app as it is, full frame (the
 * docs' cuts, one per theme). `colorful`, for X: the light debugger in brighter colours, filmed as a
 * window on a colourful backdrop. The app never changes: a look is CSS laid over it while filming,
 * colours for the film's overlay, and a backdrop the frames are composited onto. */
import sharp from "sharp";

export interface Look {
  /** The theme it's made for. */
  theme: "dark" | "light";
  /** Where the app sits in the 1920×1080 frame (CSS px). The page is filmed at this size, so its
   * text stays the size it is full frame; there's just less of it. */
  window: { x: number; y: number; width: number; height: number };
  /** Over the app's own CSS (an adopted sheet, so it's in place before the first paint). */
  css: string;
  /** The cursor's ring. */
  accent: string;
  /** The overlay's colours (overlay.js): caption, key and card styles, and card text colours. */
  overlay: Record<string, unknown>;
  /** The frame around the window, `scale` times 1920×1080: a PNG, clear where the window shows. */
  backdrop(scale: number): Promise<Buffer>;
}

const WINDOW = { x: 160, y: 90, width: 1600, height: 900 };
const RADIUS = 18;

const colorful: Look = {
  theme: "light",
  window: WINDOW,
  // The app's tokens (apps/debugger/src/styles/app.css), brighter: a violet primary, the caller in
  // blue and the agent in pink, and each pipeline stage its own colour. Stronger than `:root`.
  css: `html:root:not(.dark) {
  --background: #f7f6fc;
  --primary: #5b3df5;
  --primary-foreground: #ffffff;
  --secondary: #f0eefa;
  --muted: #f0eefa;
  --muted-foreground: #5f5a78;
  --accent: #ebe8fa;
  --border: #e4e0f2;
  --input: #e4e0f2;
  --ring: #5b3df5;
  --sidebar-primary: #5b3df5;
  --sidebar-accent: #f0eefa;
  --sidebar-border: #e4e0f2;
  --sidebar-ring: #5b3df5;
  --caller: #2b6cff;
  --agent: #e5338a;
  --warning: #e07800;
  --destructive: #e5364b;
  --info: #5f5a78;
  --llm: #8b5cf6;
  --tool: #ff7a1a;
  --tts: #00b0a2;
  --eou: #2b6cff;
}
/* A test that passes reads as one: green, where the app marks it in its primary colour. */
[data-status="pass"] .text-primary {
  color: #10a765;
}`,
  accent: "#5b3df5",
  overlay: {
    caption: {
      background: "linear-gradient(120deg, #5b3df5 0%, #b43dd6 55%, #e5338a 100%)",
      boxShadow: "0 14px 40px rgb(91 61 245 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.18)",
      color: "#ffffff",
    },
    key: {
      background: "#1d1a3a",
      color: "#ffffff",
      boxShadow: "0 5px 0 #0c0a1f, 0 14px 30px rgb(29 26 58 / 0.3)",
    },
    card: {
      background:
        "radial-gradient(55% 70% at 18% 12%, #ffe1f0 0%, transparent 70%), radial-gradient(60% 75% at 85% 92%, #e0dbff 0%, transparent 70%), #ffffff",
      color: "#15122b",
    },
    title: {
      background: "linear-gradient(120deg, #5b3df5 10%, #e5338a 90%)",
      backgroundClip: "text",
      webkitBackgroundClip: "text",
      color: "transparent",
      paddingBottom: "8px",
    },
    eyebrow: "#6b6689",
    subtitle: "#4b4666",
    line: "#5b3df5",
  },
  async backdrop(scale) {
    const { x, y, width: w, height: h } = WINDOW;
    // Soft colour fields under a light grain (so the gradients don't band once X re-encodes them),
    // the window's shadow, and a hole where the window goes.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${1920 * scale}" height="${1080 * scale}" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffc4de"/><stop offset="0.5" stop-color="#d9ccff"/><stop offset="1" stop-color="#bfe3ff"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="120"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>
    <mask id="hole"><rect width="1920" height="1080" fill="#fff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${RADIUS}" fill="#000"/></mask>
  </defs>
  <g mask="url(#hole)">
    <rect width="1920" height="1080" fill="url(#base)"/>
    <g filter="url(#soft)" opacity="0.9">
      <circle cx="160" cy="80" r="430" fill="#ff5fa2"/>
      <circle cx="1800" cy="220" r="470" fill="#7b61ff"/>
      <circle cx="220" cy="1060" r="430" fill="#38bdf8"/>
      <circle cx="1760" cy="1040" r="420" fill="#ff7eb3"/>
    </g>
    <rect width="1920" height="1080" filter="url(#grain)" opacity="0.07"/>
    <rect x="${x}" y="${y + 22}" width="${w}" height="${h}" rx="${RADIUS}" fill="#2e1065" opacity="0.32" filter="url(#shadow)"/>
    <rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}" rx="${RADIUS + 1}" fill="none" stroke="#1d1a3a" stroke-opacity="0.12" stroke-width="2"/>
  </g>
</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },
};

export const LOOKS: Record<string, Look> = { colorful };
