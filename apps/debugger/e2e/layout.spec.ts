import type { Page } from "@playwright/test";

import { DEMO, expect, laneBoxes, open, panelBox, settledSize, test } from "./fixtures";

const TOOLBAR = 40;

/** Every gutter label sits exactly beside its lane. */
async function expectAligned(page: Page) {
  const { gutter, lanes } = await laneBoxes(page);
  expect(Object.keys(gutter)).toEqual(Object.keys(lanes));
  for (const [id, g] of Object.entries(gutter)) {
    expect(Math.abs(g.top - lanes[id]!.top), `${id} top`).toBeLessThan(0.5);
    expect(Math.abs(g.height - lanes[id]!.height), `${id} height`).toBeLessThan(0.5);
  }
}

test.describe("toolbar", () => {
  test("keeps View with the screen's controls on the right, and centres its separator", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    const view = await page.getByRole("button", { name: /^View/ }).boundingBox();
    const keys = await page.getByRole("button", { name: "Keyboard shortcuts" }).boundingBox();
    expect(view!.x).toBeGreaterThan(800);
    expect(keys!.x).toBeGreaterThan(view!.x);
    const play = await page.locator("[data-slot=player-toggle]").boundingBox();
    for (const separator of await page.locator("fieldset [data-slot=separator]").all()) {
      const bar = await separator.boundingBox();
      expect(Math.abs(bar!.y + bar!.height / 2 - (play!.y + play!.height / 2))).toBeLessThan(1);
    }
  });
});

test.describe("layout", () => {
  test("gives the timeline most of the screen, its lanes grown to fill it", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    const timeline = (await panelBox(page, "timeline"))!;
    expect(timeline.height / (1000 - TOOLBAR)).toBeGreaterThan(0.6);
    const audio = await page.locator("[data-slot=timeline] .lane[data-lane=caller]").boundingBox();
    expect(audio!.height).toBeGreaterThan(46);
    await expectAligned(page);
  });

  test("T folds the transcript away and back; the lanes follow", async ({ debuggerPage: page }) => {
    await open(page);
    const audio = page.locator("[data-slot=timeline] .lane[data-lane=caller]");
    const before = (await audio.boundingBox())!.height;
    await page.locator("main").focus();
    await page.keyboard.press("t");
    await expect.poll(async () => (await panelBox(page, "transcript"))!.height).toBe(0);
    await expect.poll(async () => (await audio.boundingBox())!.height).toBeGreaterThan(before);
    await expectAligned(page);
    // Folded, not unmounted: out of reach of Tab and screen readers.
    await expect(page.locator("[data-layout-panel=transcript] > [inert]")).toHaveCount(1);
    await page.keyboard.press("t");
    await expect.poll(async () => (await panelBox(page, "transcript"))!.height).toBeGreaterThan(200);
  });

  test("resizes the transcript from its separator, and keeps the size with no jump on reload", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    const start = (await panelBox(page, "transcript"))!.height;
    await page.getByRole("separator", { name: "Resize the transcript" }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
    const resized = await settledSize(page, "transcript", "height");
    expect(resized).toBeLessThan(start - 40);
    await expectAligned(page);

    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive") return;
        const box = document
          .querySelector("[data-layout-panel=transcript]")
          ?.parentElement?.getBoundingClientRect();
        (window as unknown as { firstHeight: number }).firstHeight = box?.height ?? -1;
      });
    });
    await page.reload();
    await page.waitForSelector("html[data-hydrated]", { state: "attached" });
    const first = await page.evaluate(() => (window as unknown as { firstHeight: number }).firstHeight);
    expect(Math.abs(first - resized)).toBeLessThan(2);
    expect(Math.abs((await panelBox(page, "transcript"))!.height - resized)).toBeLessThan(2);
  });

  test("keeps labels and lanes aligned at any height", async ({ debuggerPage: page }) => {
    for (const height of [640, 900, 1300]) {
      await page.setViewportSize({ width: 1600, height });
      await open(page);
      await expectAligned(page);
    }
  });

  test("lays out the panels before any script runs", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto(DEMO);
    const main = (await page.locator("main").boundingBox())!;
    const transcript = (await panelBox(page, "transcript"))!;
    const inspector = (await panelBox(page, "inspector"))!;
    expect(inspector.width).toBe(416);
    expect(transcript.height / (main.height - TOOLBAR)).toBeGreaterThan(0.3);
    expect(transcript.height / (main.height - TOOLBAR)).toBeLessThan(0.4);
    await context.close();
  });
});

test.describe("the View menu", () => {
  test("groups its settings in submenus you can reach from the keyboard", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("v");
    const menu = page.getByRole("menu").first();
    await expect(menu).toBeVisible();
    // Every item has an icon.
    for (const item of await menu.locator("[role^=menuitem]").all())
      await expect(item.locator("svg").first()).toBeAttached();
    const density = page.getByRole("menuitem", { name: /^Density/ });
    await expect(density).toContainText("Comfortable");
    await density.focus();
    await page.keyboard.press("ArrowRight");
    // Focus moves into the submenu once it's open.
    await expect(page.getByRole("menuitemradio", { name: "Compact" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(density).toBeFocused();
    await expect(page.getByRole("menuitemradio", { name: "Compact" })).toBeHidden();
    await expect(page.getByRole("menuitem", { name: /^Theme/ })).toContainText("System");
  });

  test("resets lanes, density and panels", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("4");
    await page.keyboard.press("t");
    await page.keyboard.press("v");
    await page.getByRole("menuitem", { name: "Reset view" }).click();
    await expect(page.getByRole("button", { name: "View", exact: true })).toBeVisible();
    await expect.poll(async () => (await panelBox(page, "transcript"))!.height).toBeGreaterThan(200);
  });
});
