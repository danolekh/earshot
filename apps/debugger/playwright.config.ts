/* End-to-end checks of the built debugger in Chromium: keys, the inspector, view settings, theme.
 * `pnpm --filter debugger build && pnpm --filter debugger e2e` (not part of `test`, which needs no
 * browser). */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4320;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: `vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
