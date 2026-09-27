import type { Page } from "@playwright/test";

import { expect, open, test } from "./fixtures";

/** Saves the demo call's tool error as a test case, from its finding in the inspector. */
async function saveToolError(page: Page) {
  await open(page);
  const row = page.locator('#inspector li:has([data-finding^="tool_error"])');
  await row.hover();
  await row.getByRole("button", { name: /^Save as test case/ }).click();
  const dialog = page.getByRole("dialog", { name: "Save as test case" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

const card = (page: Page) => page.getByRole("article").first();
const run = (page: Page, call: string) => card(page).locator(`[data-call="${call}"]`);

test.describe("saved tests", () => {
  test("says how to save one when there are none", async ({ debuggerPage: page }) => {
    await page.goto("/tests/");
    await expect(page.getByRole("heading", { name: "No saved tests yet" })).toBeVisible();
    await page.getByRole("link", { name: "Open the demo call" }).click();
    await expect(page).toHaveURL(/\/call\/stadtwerke-zaehlerstand\/\?.*finding=tool_error/);
  });

  test("save from a call, then see it fail on v42 and pass on v43", async ({ debuggerPage: page }) => {
    await saveToolError(page);
    await expect(page.getByText("Saved to Tests")).toBeVisible();
    await page.getByRole("button", { name: "View tests" }).click();
    await expect(page).toHaveURL(/\/tests\/$/);
    await expect(page.getByRole("link", { name: /^Tests/ })).toContainText("1");

    await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(
      "Stadtwerke Muster · Zählerstand · Tool failed at 0:25",
    );
    await expect(run(page, "stadtwerke-zaehlerstand")).toContainText("4 of 4 fail");
    await expect(run(page, "stadtwerke-zaehlerstand")).toContainText("drafted here");
    await expect(run(page, "stadtwerke-zaehlerstand-v43")).toContainText("All pass");

    // The fixed call's checks, each at the moment it looked at.
    await run(page, "stadtwerke-zaehlerstand-v43").getByRole("button").click();
    const checks = run(page, "stadtwerke-zaehlerstand-v43").getByRole("listitem");
    await expect(checks).toHaveCount(4);
    await expect(checks.filter({ hasText: "crm.lookup_customer succeeds" })).toContainText("succeeded");
    await checks
      .filter({ hasText: /^Hears/ })
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/call\/stadtwerke-zaehlerstand-v43\/\?.*turn=/);
    await page.waitForSelector("[data-slot=timeline] canvas");
    await expect(page.locator("#inspector")).toContainText("null");
  });

  test("exports as a file, as JSON, and as a LiveKit test", async ({ debuggerPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await saveToolError(page);
    await page.goto("/tests/");
    await expect(run(page, "stadtwerke-zaehlerstand-v43")).toContainText("All pass");

    await card(page).getByRole("button", { name: "Export" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download .json" }).click();
    expect((await download).suggestedFilename()).toBe(
      "stadtwerke-muster-zahlerstand-tool-failed-at-0-25.test.json",
    );

    await card(page).getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: /LiveKit test/ }).click();
    await expect(page.getByText("Copied as a LiveKit test")).toBeVisible();
    const py = await page.evaluate(() => navigator.clipboard.readText());
    expect(py).toMatch(/^"""/);
    expect(py).toContain('contains_function_call(name="crm.lookup_customer"');
  });

  test("deletes a test, and undoes it", async ({ debuggerPage: page }) => {
    await saveToolError(page);
    await page.goto("/tests/");
    await expect(page.getByRole("article")).toHaveCount(1);
    await card(page)
      .getByRole("button", { name: /^Delete/ })
      .click();
    await expect(page.getByRole("heading", { name: "No saved tests yet" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(1);
  });

  test("moves between the two lists from the tabs", async ({ debuggerPage: page }) => {
    await page.goto("/?type=dead_air");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /^Tests/ }).click();
    await expect(page).toHaveURL(/\/tests\/$/);
    await expect(page.getByRole("link", { name: /^Tests/ })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: /^Calls/ }).click();
    // Back to the list as it was left.
    await expect(page).toHaveURL(/\/\?type=dead_air/);
    await expect(page.getByRole("link", { name: /^Calls/ })).toHaveAttribute("aria-current", "page");
  });
});
