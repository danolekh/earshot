import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import calls from "./src/calls/index.json" with { type: "json" };

// `--mode stage` builds the version apps/promo films (src/lib/stage.ts) into its own folder, so a
// deploy (which ships .output) can never pick it up.
export default defineConfig(({ mode }) => ({
  server: { port: 3011 },
  plugins: [
    tailwindcss(),
    // Prerendered to static HTML and served as Cloudflare static assets, like the docs.
    tanstackStart({
      prerender: { enabled: true, crawlLinks: false },
      pages: [
        { path: "/" },
        { path: "/tests/" },
        { path: "/imported/" },
        ...calls.map((c) => ({ path: `/call/${c.id}/` })),
      ],
    }),
    react(),
    nitro(mode === "stage" ? { output: { dir: ".output-stage" } } : {}),
  ],
  resolve: { tsconfigPaths: true },
}));
