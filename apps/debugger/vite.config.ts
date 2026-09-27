import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import calls from "./src/calls/index.json" with { type: "json" };

export default defineConfig({
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
    nitro(),
  ],
  resolve: { tsconfigPaths: true },
});
