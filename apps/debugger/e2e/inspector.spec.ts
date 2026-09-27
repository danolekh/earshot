import { expect, inspector, open, panelBox, settledSize, test } from "./fixtures";

test.describe("the inspector", () => {
  test("keys work with focus inside it", async ({ debuggerPage: page }) => {
    await open(page);
    const first = page.locator("#inspector [data-finding]").first();
    await first.focus();
    await page.keyboard.press("]");
    await expect(first).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("k");
    await expect(page.locator("[data-slot=player][data-playing]")).toHaveCount(1);
    await page.keyboard.press("k");
    await page.keyboard.press("Shift+?");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("B closes it and moves focus out; ⌘B / Ctrl+B toggles it", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("#inspector [data-finding]").first().focus();
    await page.keyboard.press("b");
    await expect(inspector(page)).toHaveAttribute("inert");
    await expect(page.locator("main")).toBeFocused();
    await expect.poll(async () => (await panelBox(page, "inspector"))!.width).toBe(0);
    await page.keyboard.press("ControlOrMeta+b");
    await expect(inspector(page)).not.toHaveAttribute("inert");
    await expect.poll(async () => (await panelBox(page, "inspector"))!.width).toBe(416);
    await page.keyboard.press("ControlOrMeta+b");
    await expect(inspector(page)).toHaveAttribute("inert");
  });

  test("Tab never reaches it while it's closed", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("b");
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("#inspector"))).toBe(false);
    }
  });

  test("resizes from its separator, and keeps its width", async ({ debuggerPage: page }) => {
    await open(page);
    await page.getByRole("separator", { name: "Resize the inspector" }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    expect(await settledSize(page, "inspector", "width")).toBe(466);
    await page.reload();
    await page.waitForSelector("html[data-hydrated]", { state: "attached" });
    // Already there when the page hands over to motion-panels: no slide from the default.
    expect((await panelBox(page, "inspector"))!.width).toBe(466);
  });

  test("a closed inspector stays closed on reload, without sliding away", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator("main").focus();
    await page.keyboard.press("b");
    // Where the panel is once the HTML is parsed and before React hydrates it.
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive") return;
        const box = document
          .querySelector("[data-layout-panel=inspector]")
          ?.parentElement?.getBoundingClientRect();
        (window as unknown as { firstWidth: number }).firstWidth = box?.width ?? -1;
      });
    });
    await page.reload();
    await page.waitForSelector("html[data-hydrated]", { state: "attached" });
    expect(await page.evaluate(() => (window as unknown as { firstWidth: number }).firstWidth)).toBe(0);
    // Closed from the start, its contents aren't mounted until it's first opened.
    await expect(page.locator("#inspector:not([inert])")).toHaveCount(0);
    expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(1580);
    await page.keyboard.press("ControlOrMeta+b");
    await expect(inspector(page)).not.toHaveAttribute("inert");
    await expect.poll(async () => (await panelBox(page, "inspector"))?.width).toBe(416);
  });
});

test.describe("on a small screen", () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test("opens the inspector as a sheet, from B and from the toolbar", async ({ debuggerPage: page }) => {
    await open(page);
    expect(await panelBox(page, "inspector")).toBeNull();
    await page.locator("main").focus();
    await page.keyboard.press("b");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Turn ended too early")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: "Inspector" }).click();
    await expect(sheet).toBeVisible();
  });
});

test.describe("the inspector's content", () => {
  test("never scrolls sideways, whatever finding is picked, on every call", async ({
    debuggerPage: page,
  }) => {
    const ids = [
      "stadtwerke-zaehlerstand",
      "solar-beratung",
      "praxis-termin",
      "versicherung-schaden",
      "tarif-wechsel",
    ];
    for (const id of ids) {
      await open(page, `/call/${id}/`);
      const findings = page.locator("#inspector [data-finding]");
      for (let i = 0; i < (await findings.count()); i++) {
        await findings.nth(i).click();
        const [scroll, client] = await page
          .locator("#inspector > div")
          .evaluate((el) => [el.scrollWidth, el.clientWidth]);
        expect(scroll, `${id} finding ${i}`).toBeLessThanOrEqual(client);
      }
    }
  });

  test("marks findings with icons, not glyphs", async ({ debuggerPage: page }) => {
    await open(page);
    const glyphs = await page.evaluate(() =>
      [...document.querySelectorAll("[data-slot=timeline-finding], [data-finding] *, .finding-chip")]
        .map((el) => getComputedStyle(el, "::before").content)
        .filter((c) => c !== "none" && c !== "normal" && c !== '""'),
    );
    expect(glyphs).toEqual([]);
    await expect(page.locator("[data-slot=timeline-finding] svg").first()).toBeVisible();
  });

  test("opens the part that explains the picked finding", async ({ debuggerPage: page }) => {
    await open(page);
    await page.locator('#inspector [data-finding^="tool_error"]').click();
    await expect(page.getByRole("button", { name: /^Tools/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: /^Latency/ })).toHaveAttribute("aria-expanded", "false");
    await page.locator('#inspector [data-finding^="slow_turn"]').click();
    await expect(page.getByRole("button", { name: /^Latency/ })).toHaveAttribute("aria-expanded", "true");
  });

  test("folds its sections, and remembers", async ({ debuggerPage: page }) => {
    await open(page);
    const findings = page.getByRole("button", { name: /^Findings/ });
    await findings.click();
    await expect(findings).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#inspector [data-finding]")).toHaveCount(0);
    await page.reload();
    await page.waitForSelector("html[data-hydrated]", { state: "attached" });
    await expect(page.getByRole("button", { name: /^Findings/ })).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("the transcript", () => {
  test("ends just under its last turn", async ({ debuggerPage: page }) => {
    await open(page);
    const gap = await page.locator(".transcript").evaluate((box) => {
      box.scrollTop = box.scrollHeight;
      const last = box.querySelector(".turn:last-of-type")!.getBoundingClientRect();
      return box.getBoundingClientRect().bottom - last.bottom;
    });
    expect(gap).toBeLessThan(24);
  });
});

test.describe("saving a bad moment as a test case", () => {
  test("drafts checks that fail on this call, re-runs them as they're edited, and exports", async ({
    debuggerPage: page,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    const row = page.locator('#inspector li:has([data-finding^="tool_error"])');
    await row.hover();
    await row.getByRole("button", { name: /^Save as test case/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save as test case" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("listitem").filter({ hasText: "crm.lookup_customer succeeds" }),
    ).toContainText("Fails on this call");
    await page.keyboard.press("Escape");

    await page.locator('#inspector [data-finding^="slow_turn"]').click();
    await page.getByRole("button", { name: "Save as test case", exact: true }).click();
    const seconds = dialog.getByRole("spinbutton", { name: "Seconds" });
    await expect(seconds).toHaveValue("1.5");
    const replyCheck = dialog
      .getByRole("listitem")
      .filter({ has: page.getByRole("spinbutton", { name: "Seconds" }) });
    await expect(replyCheck).toContainText("Fails on this call");
    await seconds.fill("4");
    await expect(replyCheck).toContainText("Passes on this call");

    await dialog.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "Copy as JSON" }).click();
    await expect(page.getByText("Copied as JSON")).toBeVisible();
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copied).toMatchObject({ version: 1, source: { callId: "stadtwerke-zaehlerstand" } });
    expect(copied.checks[0]).toMatchObject({ kind: "reply_within", seconds: 4 });
  });
});

test.describe("picking findings", () => {
  test("] steps from finding to finding, picking each", async ({ debuggerPage: page }) => {
    await open(page);
    await page.focus("[aria-label='Call debugger']");
    await page.keyboard.press("]");
    const current = page.locator("#inspector [aria-current=true]");
    await expect(current).toContainText("Turn ended too early");
    await page.keyboard.press("]");
    await expect(current).toContainText("Talk-over");
    await page.keyboard.press("[");
    await expect(current).toContainText("Turn ended too early");
  });

  test("a link to a finding opens with its turn in Details", async ({ debuggerPage: page }) => {
    await page.goto("/");
    await page
      .locator("tr[data-call=stadtwerke-zaehlerstand]")
      .getByRole("link", { name: /Misheard/ })
      .click();
    await page.waitForSelector("[data-slot=timeline] canvas");
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Misheard words");
    await expect(page.getByRole("region", { name: "Picked turn" })).toBeVisible();
    await expect(page.locator("#inspector")).toContainText("Heard vs said");
  });
});

test.describe("keys", () => {
  test("typed in the View menu, don't reach the debugger", async ({ debuggerPage: page }) => {
    await open(page);
    await page.getByRole("button", { name: /^View/ }).click();
    await expect(page.getByRole("menu", { name: "View" })).toBeVisible();
    await page.keyboard.press("k");
    await page.keyboard.press("t");
    await expect(page.locator("[data-slot=player][data-playing]")).toHaveCount(0);
    // T didn't fold the transcript either.
    expect((await panelBox(page, "transcript"))!.height).toBeGreaterThan(0);
  });

  test("pick a transcript turn from the keyboard", async ({ debuggerPage: page }) => {
    await open(page);
    const head = page.locator(".transcript [data-slot=transcript-pick]").nth(2);
    await head.focus();
    await page.keyboard.press("Enter");
    await expect(head).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("region", { name: "Picked turn" })).toBeVisible();
  });

  test("a focused scrubber's ] picks the finding too", async ({ debuggerPage: page }) => {
    await open(page);
    await page.getByRole("slider").focus();
    await page.keyboard.press("]");
    await expect(page.locator("#inspector [aria-current=true]")).toContainText("Turn ended too early");
  });

  test("the findings are one tab stop, the arrows moving between them", async ({ debuggerPage: page }) => {
    await open(page);
    const findings = page.locator("#inspector [data-finding]");
    await expect(findings.first()).toHaveAttribute("tabindex", "0");
    await expect(findings.nth(1)).toHaveAttribute("tabindex", "-1");
    await findings.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(findings.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(findings.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(findings.first()).toBeFocused();
    // Nothing picked by moving: Enter picks.
    await expect(page.locator("#inspector [aria-current=true]")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(findings.nth(1)).toHaveAttribute("aria-current", "true");
  });
});
