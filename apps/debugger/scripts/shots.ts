/* Screenshots of the built debugger, dark and light, to check the layout by eye: the call list
 * (all, and filtered), a call with the inspector open, the same with it closed by B, the consent
 * line zoomed in so the words can be checked against the waveform, a test case saved from it, the
 * Tests page running that test on every call of its flow, the same call as ElevenLabs Agents kept
 * it, and importing Pipecat's export. Any console error, hydration warnings included, fails the
 * run.
 *
 *   pnpm --filter debugger build && pnpm --filter debugger shots [out-dir]
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

const PORT = 4311;
const BASE = `http://localhost:${PORT}`;
const out = resolve(process.argv[2] ?? "shots");
mkdirSync(out, { recursive: true });

// In its own process group, so stopping it stops vite too, not only the pnpm around it.
const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  detached: true,
});
let exited = false;
server.on("exit", () => (exited = true));
for (let tries = 0; ; tries++) {
  if (exited || tries > 100) throw new Error("vite preview didn't start");
  if (
    await fetch(BASE).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  await new Promise((r) => setTimeout(r, 200));
}

const errors: string[] = [];
const browser = await chromium.launch();
try {
  for (const theme of ["dark", "light"] as const) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: theme });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${theme}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${theme}: ${e.message}`));

    const open = async (path: string) => {
      await page.goto(BASE + path);
      await page.waitForSelector("[data-slot=timeline] canvas");
      await page.waitForLoadState("networkidle");
    };
    const shot = (p: Page, name: string) => p.screenshot({ path: `${out}/${theme}-${name}.png` });

    // The call list, then filtered to one finding type.
    await page.goto(BASE + "/");
    await page.waitForSelector("tbody tr[data-call]");
    await page.waitForLoadState("networkidle");
    await shot(page, "calls");
    await page.goto(BASE + "/?type=dead_air");
    await page.waitForSelector("tbody tr[data-call]");
    await shot(page, "calls-filtered");
    await page
      .getByRole("toolbar", { name: "Filters" })
      .getByRole("button", { name: /^Findings/ })
      .click();
    await page.waitForTimeout(300);
    await shot(page, "calls-filter-open");
    await page.keyboard.press("Escape");

    await open("/call/stadtwerke-zaehlerstand/");
    await shot(page, "inspector-open");
    await page.focus("[aria-label='Call debugger']");
    await page.keyboard.press("b");
    await page.waitForTimeout(400);
    await shot(page, "inspector-closed");

    await page.getByRole("button", { name: /^View/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name: "Each lane", exact: true }).hover();
    await page.waitForTimeout(300);
    await shot(page, "view-menu");
    // The submenu, then the menu.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.focus("[aria-label='Call debugger']");
    await page.keyboard.press("4");
    await page.waitForTimeout(200);
    await page.locator(".gutter [data-lane=spans]").hover();
    await shot(page, "words-hidden");
    await page.locator(".gutter [data-lane=findings]").hover();
    await page.getByRole("button", { name: "Hide the Findings lane" }).click();
    await page.focus("[aria-label='Call debugger']");
    await page.keyboard.press("]");
    await page.waitForTimeout(300);
    await shot(page, "hidden-notice");
    await page.keyboard.press("t");
    await page.waitForTimeout(500);
    await shot(page, "transcript-folded");
    await page.keyboard.press("t");

    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await open("/call/stadtwerke-zaehlerstand/?from=7.4&to=9.8&t=8&turn=t1");
    await shot(page, "consent-zoomed");
    await page.locator('#inspector [data-finding^="tool_error"]').click();
    await page.waitForTimeout(500);
    await shot(page, "inspector-tool");
    await page.getByRole("button", { name: "Save as test case", exact: true }).click();
    await page.waitForTimeout(400);
    await shot(page, "test-case");
    const dialog = page.getByRole("dialog", { name: "Save as test case" });
    await dialog.getByRole("button", { name: "Export" }).click();
    await page.waitForTimeout(300);
    await shot(page, "test-export");
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    // The saved test on v42 and on the fixed v43, the fixed call's checks open.
    await page.getByRole("button", { name: "View tests" }).click();
    await page.waitForSelector("article [data-call=stadtwerke-zaehlerstand-v43] button");
    await page.locator("article [data-call=stadtwerke-zaehlerstand-v43] button").click();
    await page.waitForTimeout(400);
    await shot(page, "tests");

    // The same call as ElevenLabs Agents kept it: one mixed lane, what it can't check.
    await open("/call/stadtwerke-zaehlerstand-elevenlabs/?finding=slow_turn:t13");
    await page.locator('#inspector [data-finding^="slow_turn"]').click();
    await page.waitForTimeout(400);
    await shot(page, "elevenlabs");
    await page.getByRole("button", { name: /^Recorded on/ }).click();
    await page.waitForTimeout(300);
    await shot(page, "elevenlabs-badge");
    await page.keyboard.press("Escape");

    // Importing Pipecat's export and its recording.
    await page.goto(BASE + "/");
    await page.waitForSelector("tbody tr[data-call]");
    await page.getByRole("button", { name: "Import call" }).click();
    const fixtures = resolve("../../calls/fixtures/stadtwerke-zaehlerstand-pipecat");
    await page
      .getByLabel("Files to import")
      .setInputFiles([
        `${fixtures}/otlp.json`,
        `${fixtures}/events.jsonl`,
        resolve("public/calls/stadtwerke-zaehlerstand-pipecat/call.ogg"),
      ]);
    await page
      .getByRole("region", { name: "What was read" })
      .getByText(/findings/)
      .waitFor();
    await shot(page, "import");
    await context.close();
  }
} finally {
  await browser.close();
  process.kill(-server.pid!, "SIGTERM");
}

if (errors.length) {
  console.error(`console errors:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`screenshots in ${out}`);
