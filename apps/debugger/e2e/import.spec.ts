import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const PIPECAT = [
  file("../../../calls/fixtures/stadtwerke-zaehlerstand-pipecat/otlp.json"),
  file("../../../calls/fixtures/stadtwerke-zaehlerstand-pipecat/events.jsonl"),
  file("../public/calls/stadtwerke-zaehlerstand-pipecat/call.ogg"),
];

const rows = (page: Page) => page.locator("tbody tr[data-call]");

async function importPipecat(page: Page) {
  await page.goto("/");
  await expect(rows(page).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Import call" }).click();
  const dialog = page.getByRole("dialog", { name: "Import a call" });
  await dialog.getByLabel("Files to import").setInputFiles(PIPECAT);
  return dialog;
}

test.describe("importing a call", () => {
  test("reads what Pipecat exported and its recording, and says what it can't check", async ({
    debuggerPage: page,
  }) => {
    const dialog = await importPipecat(page);
    const files = dialog.getByRole("list", { name: "Files" });
    await expect(files.locator("li[data-kind=pipecat-otlp]")).toContainText("Pipecat spans");
    await expect(files.locator("li[data-kind=pipecat-events]")).toContainText("Pipecat observer events");
    await expect(files.locator("li[data-kind=audio]")).toContainText("Recording, stereo");
    const read = dialog.getByRole("region", { name: "What was read" });
    await expect(read).toContainText(/Pipecat · 16 turns · \d+ spans · \d+ findings/);
    // No transcript of what was said came with it, nor the recogniser's confidence.
    await expect(read).toContainText("Misheard words: no transcript of what was said");
    await expect(read).toContainText("Unsure transcription: no confidence from the recogniser");
  });

  test("opens it, keeps it in the list across reloads, and removes it with Undo", async ({
    debuggerPage: page,
  }) => {
    const dialog = await importPipecat(page);
    await expect(dialog.getByRole("button", { name: "Open call" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Open call" }).click();
    await expect(page).toHaveURL(/\/imported\/\?.*id=imp-/);
    await page.waitForSelector("[data-slot=timeline] canvas");
    await expect(page.getByRole("button", { name: /^Recorded on Pipecat/ })).toBeVisible();
    await expect(page.locator(".gutter [data-lane=caller]")).toBeVisible();
    await expect(page.locator("#inspector")).toContainText("Turn ended too early");

    await page.getByRole("link", { name: "Calls" }).click();
    await expect(rows(page)).toHaveCount(10);
    const imported = rows(page).filter({ hasText: "Imported" });
    await expect(imported).toHaveCount(1);
    await expect(imported).toContainText("Pipecat call");
    await page.reload();
    await expect(rows(page).filter({ hasText: "Imported" })).toHaveCount(1);

    await rows(page)
      .filter({ hasText: "Imported" })
      .getByRole("button", { name: /^Remove/ })
      .click();
    await expect(rows(page)).toHaveCount(9);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("links to a moment of it keep its id", async ({ debuggerPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const dialog = await importPipecat(page);
    await dialog.getByRole("button", { name: "Open call" }).click();
    await page.waitForSelector("[data-slot=timeline] canvas");
    await page.locator('#inspector [data-finding^="tool_error"]').click();
    await page.getByRole("button", { name: "Copy link to this moment" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.pathname).toBe("/imported/");
    expect(link.searchParams.get("id")).toMatch(/^imp-/);
    expect(link.searchParams.get("finding")).toMatch(/^tool_error/);
    await page.goto(link.pathname + link.search);
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Tool failed");
    await expect(page.getByRole("region", { name: "Picked turn" })).toBeVisible();
  });

  test("says when the files aren't a call", async ({ debuggerPage: page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Import call" }).click();
    const dialog = page.getByRole("dialog", { name: "Import a call" });
    await dialog.getByLabel("Files to import").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(dialog.locator("li[data-kind=unknown]")).toContainText("Not an export earshot reads");
    await expect(dialog.getByRole("region", { name: "What was read" })).toContainText(
      "No call in these files",
    );
    await expect(dialog.getByRole("button", { name: "Open call" })).toBeDisabled();
  });
});
