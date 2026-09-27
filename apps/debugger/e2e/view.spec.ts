import type { Page } from "@playwright/test";

import { DEMO, expect, open, test } from "./fixtures";

const gutter = (page: Page) =>
  page.locator(".gutter [data-lane]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.lane));
const lanes = (page: Page) =>
  page
    .locator("[data-slot=timeline] .lane")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.lane));

async function openView(page: Page) {
  await page.getByRole("button", { name: /^View/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("view settings", () => {
  test("hides every word lane at once, remembers it, and shows them again", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    await openView(page);
    await page.getByRole("menuitemcheckbox", { name: "Word lanes" }).click();
    await page.keyboard.press("Escape");
    const without = ["findings", "caller", "turns", "agent", "spans", "context"];
    expect(await gutter(page)).toEqual(without);
    expect(await lanes(page)).toEqual(without);
    await expect(page.getByRole("button", { name: "View: 3 hidden" })).toBeVisible();

    await page.reload();
    await page.waitForSelector("[data-slot=timeline] canvas");
    expect(await gutter(page)).toEqual(without);

    await openView(page);
    await page.getByRole("menuitem", { name: "Layout" }).click();
    await page.getByRole("menuitem", { name: "Every lane" }).click();
    expect((await gutter(page)).length).toBe(9);
  });

  test("marks a partly shown set as mixed, and shows all of it on the first click", async ({
    debuggerPage: page,
  }) => {
    await open(page);
    await openView(page);
    await page.getByRole("menuitem", { name: "Each lane", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Agent heard" }).click();
    await page.keyboard.press("Escape");
    const words = page.getByRole("menuitemcheckbox", { name: /^Word lanes/ });
    await expect(words).toHaveAttribute("aria-checked", "mixed");
    await words.click();
    await expect(words).toHaveAttribute("aria-checked", "true");
    expect(await gutter(page)).toContain("heard");
  });

  test("won't hide the last lane", async ({ debuggerPage: page }) => {
    await open(page);
    await openView(page);
    for (const name of ["Caller lanes", "Agent lanes", "Pipeline lanes"])
      await page.getByRole("menuitemcheckbox", { name: new RegExp(`^${name}`) }).click();
    expect(await gutter(page)).toEqual(["findings"]);
    await page.getByRole("menuitem", { name: "Each lane", exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Findings" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Hide the .* lane$/ })).toHaveCount(0);
  });

  test("says so when a link hides every lane", async ({ debuggerPage: page }) => {
    // No lane, so no waveform to wait for: the message only shows once the page has hydrated.
    await page.goto(`${DEMO}?hide=findings,caller,heard,said,turns,agent,agent-words,spans,context`);
    await expect(page.getByText("Every lane is hidden.")).toBeVisible();
    await page.getByRole("button", { name: "Show all lanes" }).click();
    expect((await gutter(page)).length).toBe(9);
  });

  test("hops to findings with their lane hidden, and offers to show it", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator(".gutter [data-lane=findings]").hover();
    await page.getByRole("button", { name: "Hide the Findings lane" }).click();
    expect(await gutter(page)).not.toContain("findings");
    await page.locator("main").focus();
    await page.keyboard.press("]");
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Turn ended too early");
    const notice = page.getByText("The picked finding is on the hidden Findings lane.");
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Show it" }).click();
    expect(await gutter(page)).toContain("findings");
    await expect(notice).toHaveCount(0);
  });

  test("V opens the menu; 1 to 4 toggle the sets and say what they did", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("4");
    expect(await gutter(page)).toEqual(["findings", "caller", "turns", "agent", "spans", "context"]);
    await expect(page.locator("div.sr-only[aria-live=polite]")).toHaveText("Word lanes hidden");
    await page.keyboard.press("4");
    expect((await gutter(page)).length).toBe(9);
    await expect(page.locator("div.sr-only[aria-live=polite]")).toHaveText("Word lanes shown");
    await page.keyboard.press("v");
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("puts hidden lanes in the URL, and a link's hidden lanes apply", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("4");
    await expect(page).toHaveURL(/hide=heard%2Csaid%2Cagent-words|hide=heard,said,agent-words/);
    await page.evaluate(() => localStorage.clear());
    await open(page, `${DEMO}?hide=spans,context`);
    expect(await gutter(page)).toEqual([
      "findings",
      "caller",
      "heard",
      "said",
      "turns",
      "agent",
      "agent-words",
    ]);
  });

  test("compact makes the lanes shorter", async ({ debuggerPage: page }) => {
    await open(page);
    const findings = page.locator("[data-slot=timeline] .lane[data-lane=findings]");
    expect((await findings.boundingBox())!.height).toBe(22);
    await openView(page);
    await page.getByRole("menuitem", { name: /^Density/ }).click();
    await page.getByRole("menuitemradio", { name: "Compact" }).click();
    expect((await findings.boundingBox())!.height).toBe(18);
  });

  test("a chosen theme applies before the first paint on reload", async ({ debuggerPage: page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await openView(page);
    await page.getByRole("menuitem", { name: /^Theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "interactive")
          (window as unknown as { firstDark: boolean }).firstDark =
            document.documentElement.classList.contains("dark");
      });
    });
    await page.reload();
    await page.waitForSelector("[data-slot=timeline] canvas");
    expect(await page.evaluate(() => (window as unknown as { firstDark: boolean }).firstDark)).toBe(false);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("listening", () => {
  test("solo and mute a side, dimming the side you can't hear", async ({ debuggerPage: page }) => {
    await open(page);
    const agentLane = page.locator("[data-slot=timeline] .lane[data-lane=agent]");
    await expect(agentLane).not.toHaveAttribute("data-muted");
    await page.getByRole("button", { name: "Solo the caller" }).click();
    await expect(page.getByRole("button", { name: "Solo the caller" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(agentLane).toHaveAttribute("data-muted", "");
    await page.getByRole("button", { name: "Solo the caller" }).click();
    await page.getByRole("button", { name: "Mute the agent" }).click();
    await expect(agentLane).toHaveAttribute("data-muted", "");
    await expect(page.locator("[data-slot=timeline] .lane[data-lane=caller]")).not.toHaveAttribute(
      "data-muted",
    );
  });
});

test.describe("getting a hidden lane back", () => {
  const hide = async (page: Page, id: string, label: string) => {
    await page.locator(`.gutter [data-lane=${id}]`).hover();
    await page.getByRole("button", { name: `Hide the ${label} lane` }).click();
  };

  test("leaves a strip where the lane was, which shows it again", async ({ debuggerPage: page }) => {
    await open(page);
    await hide(page, "caller", "Caller audio");
    expect(await gutter(page)).not.toContain("caller");
    // The strip sits between the lanes that were either side.
    const order = await page
      .locator(".gutter > li")
      .evaluateAll((els) =>
        els.map(
          (el) =>
            (el as HTMLElement).dataset.lane ?? (el.querySelector("button[aria-label^=Show]") ? "strip" : ""),
        ),
      );
    expect(order.slice(1, 4)).toEqual(["findings", "strip", "heard"]);
    await page.getByRole("button", { name: "Show Caller audio" }).click();
    expect((await gutter(page)).slice(0, 2)).toEqual(["findings", "caller"]);
  });

  test("merges neighbouring hidden lanes into one strip", async ({ debuggerPage: page }) => {
    await open(page);
    await hide(page, "heard", "Agent heard");
    await hide(page, "said", "Was said");
    const strip = page.getByRole("button", { name: /^Show 2 hidden lanes/ });
    await expect(strip).toHaveCount(1);
    // From the keyboard too.
    await strip.focus();
    await page.keyboard.press("Enter");
    expect(await gutter(page)).toContain("said");
    expect(await gutter(page)).toContain("heard");
  });

  test("offers Undo right after hiding", async ({ debuggerPage: page }) => {
    await open(page);
    await hide(page, "spans", "Pipeline");
    await expect(page.getByText("Pipeline hidden")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await gutter(page)).toContain("spans");
  });
});
