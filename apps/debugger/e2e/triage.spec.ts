import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const rows = (page: Page) => page.locator("tbody tr[data-call]");
const ids = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.call));

async function openList(page: Page, path = "/") {
  await page.goto(path);
  await expect(rows(page).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

const filters = (page: Page) => page.getByRole("toolbar", { name: "Filters" });

/** Picks options in one of the toolbar's filters, and closes it. */
async function pick(page: Page, filter: string, ...options: string[]) {
  await filters(page)
    .getByRole("button", { name: new RegExp(`^${filter}`) })
    .click();
  for (const o of options) await page.getByRole("option", { name: new RegExp(`^${o}`) }).click();
  await page.keyboard.press("Escape");
}

/** Where the search and the filter buttons are, and how wide. */
const toolbarBoxes = (page: Page) =>
  filters(page)
    .locator("input, button")
    .evaluateAll((els) =>
      els.slice(0, 6).map((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.width)];
      }),
    );

test.describe("the call list", () => {
  test("lists every call, worst first", async ({ debuggerPage: page }) => {
    await openList(page);
    expect(await ids(page)).toEqual([
      "stadtwerke-zaehlerstand",
      "stadtwerke-zaehlerstand-pipecat",
      "stadtwerke-zaehlerstand-elevenlabs",
      "solar-beratung",
      "praxis-termin",
      "tarif-wechsel",
      "versicherung-schaden",
      "stadtwerke-zaehlerstand-v43",
      "paket-rueckruf",
    ]);
    await expect(page.locator("tr[data-call=paket-rueckruf]")).toContainText("No findings");
    // The same flow, fixed: clean, and told apart by its prompt.
    await expect(page.locator("tr[data-call=stadtwerke-zaehlerstand-v43]")).toContainText("No findings");
    await expect(page.locator("tr[data-call=stadtwerke-zaehlerstand-v43]")).toContainText("zaehlerstand@8");
  });

  test("filters by finding type in the URL, without moving the toolbar", async ({ debuggerPage: page }) => {
    await openList(page);
    const before = await toolbarBoxes(page);
    await pick(page, "Findings", "Dead air");
    await expect(page).toHaveURL(/type=dead_air/);
    expect(await ids(page)).toEqual([
      "stadtwerke-zaehlerstand",
      "stadtwerke-zaehlerstand-pipecat",
      "stadtwerke-zaehlerstand-elevenlabs",
      "solar-beratung",
      "tarif-wechsel",
    ]);
    expect(await toolbarBoxes(page)).toEqual(before);
    await pick(page, "Findings", "Dead air");
    expect((await ids(page)).length).toBe(9);
  });

  test("filters by severity, and counts each option under the other filters", async ({
    debuggerPage: page,
  }) => {
    await openList(page);
    await pick(page, "Severity", "Has errors");
    expect(await ids(page)).not.toContain("versicherung-schaden");
    expect(await ids(page)).not.toContain("paket-rueckruf");
    await filters(page)
      .getByRole("button", { name: /^Findings/ })
      .click();
    // Talk-over is in four calls, three of them with errors (ElevenLabs' mono call can't show it).
    await expect(page.getByRole("option", { name: /^Talk-over/ })).toContainText("3");
    await page.keyboard.press("Escape");
  });

  test("searches words without accents, and says when nothing matches", async ({ debuggerPage: page }) => {
    await openList(page);
    await page.getByRole("searchbox", { name: "Search calls" }).fill("ozdemir");
    expect(await ids(page)).toEqual(["versicherung-schaden"]);
    await page.getByRole("searchbox", { name: "Search calls" }).fill("xyzzy");
    await expect(page.getByText("No results.")).toBeVisible();
    await page.getByRole("button", { name: "Reset" }).click();
    expect((await ids(page)).length).toBe(9);
  });

  test("sorts from a column's header, and hides columns", async ({ debuggerPage: page }) => {
    await openList(page);
    await page.getByRole("button", { name: /^Started/ }).click();
    await page.getByRole("menuitemcheckbox", { name: "Asc" }).click();
    await expect(page).toHaveURL(/sort=started\.asc/);
    expect((await ids(page))[0]).toBe("tarif-wechsel");

    await page.getByRole("button", { name: "Toggle columns" }).click();
    await page.getByRole("option", { name: /^Prompt/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: /^Prompt/ })).toHaveCount(0);
    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^Prompt/ })).toHaveCount(0);
  });

  test("opens a call at the finding the filters point to, and goes back to the same list", async ({
    debuggerPage: page,
  }) => {
    await openList(page, "/?type=dead_air");
    await page.locator("tr[data-call=solar-beratung] [data-call-link]").click();
    await expect(page).toHaveURL(/\/call\/solar-beratung\/\?.*finding=dead_air/);
    await page.waitForSelector("[data-slot=timeline] canvas");
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Dead air");
    await expect(page.getByLabel("Call 4 of 5")).toBeVisible();

    await page.getByRole("link", { name: "Next call" }).click();
    await expect(page).toHaveURL(/\/call\/tarif-wechsel\/\?.*finding=dead_air/);

    await page.getByRole("link", { name: "Calls" }).click();
    await expect(page).toHaveURL(/\/\?type=dead_air/);
    expect(await ids(page)).toEqual([
      "stadtwerke-zaehlerstand",
      "stadtwerke-zaehlerstand-pipecat",
      "stadtwerke-zaehlerstand-elevenlabs",
      "solar-beratung",
      "tarif-wechsel",
    ]);
  });

  test("opens a call at one finding from its chip, or anywhere on its row", async ({
    debuggerPage: page,
  }) => {
    await openList(page);
    await page
      .locator("tr[data-call=stadtwerke-zaehlerstand]")
      .getByRole("link", { name: /Misheard/ })
      .click();
    await expect(page).toHaveURL(/finding=heard_vs_said/);
    await page.waitForSelector("[data-slot=timeline] canvas");
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Misheard words");

    await openList(page);
    await page.locator("tr[data-call=tarif-wechsel] td").nth(2).click();
    await expect(page).toHaveURL(/\/call\/tarif-wechsel\//);
  });

  test("moves through calls from the keyboard", async ({ debuggerPage: page }) => {
    await openList(page);
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search calls" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rows(page).nth(0).locator("[data-call-link]")).toBeFocused();
    await page.keyboard.press("j");
    await expect(rows(page).nth(1).locator("[data-call-link]")).toBeFocused();
    await page.keyboard.press("k");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/call\/stadtwerke-zaehlerstand/);
  });

  test("still opens links from before the table", async ({ debuggerPage: page }) => {
    await openList(page, "/?errors=1");
    expect(await ids(page)).not.toContain("versicherung-schaden");
    expect((await ids(page)).length).toBe(6);
  });
});
