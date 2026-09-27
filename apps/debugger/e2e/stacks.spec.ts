import type { Page } from "@playwright/test";

import { expect, open, test } from "./fixtures";

const EL = "/call/stadtwerke-zaehlerstand-elevenlabs/";
const rows = (page: Page) => page.locator("tbody tr[data-call]");
const ids = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.call));

test.describe("the same call from three stacks", () => {
  test("filters the list by stack", async ({ debuggerPage: page }) => {
    await page.goto("/");
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("toolbar", { name: "Filters" })
      .getByRole("button", { name: /^Stack/ })
      .click();
    await expect(page.getByRole("option", { name: /^LiveKit/ })).toContainText("7");
    await page.getByRole("option", { name: /^ElevenLabs/ }).click();
    await page.getByRole("option", { name: /^Pipecat/ }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/provider=elevenlabs(%2C|,)pipecat/);
    expect(await ids(page)).toEqual([
      "stadtwerke-zaehlerstand-pipecat",
      "stadtwerke-zaehlerstand-elevenlabs",
    ]);
    await expect(page.locator("tr[data-call=stadtwerke-zaehlerstand-elevenlabs]")).toContainText(
      "ElevenLabs",
    );
  });

  test("draws a mono recording as one lane, with no side to mute", async ({ debuggerPage: page }) => {
    await open(page, EL);
    const gutter = page.locator(".gutter [data-lane]");
    await expect(gutter).toHaveCount(8);
    expect(await gutter.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.lane))).toEqual([
      "findings",
      "call",
      "heard",
      "said",
      "turns",
      "agent-words",
      "spans",
      "context",
    ]);
    await expect(page.getByRole("button", { name: /^Mute/ })).toHaveCount(0);
  });

  test("says what the stack doesn't record, and doesn't pass it", async ({ debuggerPage: page }) => {
    await open(page, `${EL}?finding=heard_vs_said:t7`);
    await page.getByRole("button", { name: /^Recorded on ElevenLabs/ }).click();
    const popover = page.getByRole("dialog");
    await expect(popover).toContainText("Can't check on this call");
    await expect(popover).toContainText("Turn ended too early: no end-of-turn decisions");
    await expect(popover).toContainText("Talk-over: a mono recording can't tell whose speech overlapped");
    await page.keyboard.press("Escape");
    // The caller's turn: the turn detector's part says it wasn't recorded.
    await page.locator('#inspector [data-finding^="heard_vs_said"]').click();
    await expect(page.locator("#inspector")).toContainText("Turn detectorNot recorded by ElevenLabs");
  });

  test("lays a reply's wait end to end from what the stack reported", async ({ debuggerPage: page }) => {
    await open(page, `${EL}?finding=slow_turn:t13`);
    await page.locator('#inspector [data-finding^="slow_turn"]').click();
    const latency = page.locator("#inspector li.stage-row[data-reported]");
    await expect(latency).toHaveCount(4);
    await expect(page.locator("#inspector")).toContainText("laid end to end");
  });

  test("runs a saved test on every stack, and can't check what one doesn't record", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    const row = page.locator('#inspector li:has([data-finding^="tool_error"])');
    await row.hover();
    await row.getByRole("button", { name: /^Save as test case/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await page.goto("/tests/");
    const run = (id: string) => page.getByRole("article").locator(`[data-call="${id}"]`);
    await expect(run("stadtwerke-zaehlerstand")).toContainText("4 of 4 fail");
    await expect(run("stadtwerke-zaehlerstand-pipecat")).toContainText("Pipecat");
    await expect(run("stadtwerke-zaehlerstand-pipecat")).toContainText("3 of 4 fail");
    await expect(run("stadtwerke-zaehlerstand-elevenlabs")).toContainText("3 of 4 fail");
    await expect(run("stadtwerke-zaehlerstand-v43")).toContainText("All pass");
    await run("stadtwerke-zaehlerstand-pipecat").getByRole("button").click();
    const cant = run("stadtwerke-zaehlerstand-pipecat").locator("li[data-status=missing]");
    await expect(cant).toContainText("Transcribes every word with confidence");
    await expect(cant).toContainText("no confidence from the recogniser");
  });
});
