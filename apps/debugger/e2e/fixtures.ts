/* The page, loaded, drawn and hydrated, failing the test on any console error (hydration warnings
 * too); and helpers for the panels. */
import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ debuggerPage: Page }>({
  debuggerPage: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await provide(page);
    expect(errors, "console errors").toEqual([]);
  },
});

export { expect };

/** The demo call's page. */
export const DEMO = "/call/stadtwerke-zaehlerstand/";

export async function open(page: Page, path = DEMO): Promise<void> {
  await page.goto(path);
  await page.waitForSelector("[data-slot=timeline] canvas");
  // The stored layout has applied and motion-panels has taken over from the first-paint CSS.
  await page.waitForSelector("html[data-hydrated]", { state: "attached" });
}

/** The inspector: inert while its panel is closed. */
export const inspector = (page: Page) => page.locator("#inspector");

export type PanelName = "timeline" | "transcript" | "inspector";

/** A panel's box: a sized panel's size is on the box around the element we tag. */
export async function panelBox(page: Page, name: PanelName) {
  return page.evaluate((n) => {
    const tagged = document.querySelector(`[data-layout-panel="${n}"]`);
    const box = (n === "timeline" ? tagged : tagged?.parentElement)?.getBoundingClientRect();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  }, name);
}

export interface LaneBox {
  top: number;
  height: number;
}

/** Every lane's box in the gutter and in the timeline, by id. */
export async function laneBoxes(
  page: Page,
): Promise<{ gutter: Record<string, LaneBox>; lanes: Record<string, LaneBox> }> {
  return page.evaluate(() => {
    const boxes = (selector: string): Record<string, { top: number; height: number }> =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>(selector)].map((el) => {
          const r = el.getBoundingClientRect();
          return [el.dataset.lane, { top: r.top, height: r.height }];
        }),
      );
    return { gutter: boxes(".gutter [data-lane]"), lanes: boxes("[data-slot=timeline] .lane") };
  });
}

/** A panel's size once it has stopped moving (a keyboard resize animates). */
export async function settledSize(page: Page, name: PanelName, axis: "width" | "height"): Promise<number> {
  let last = -1;
  for (let i = 0; i < 50; i++) {
    const now = (await panelBox(page, name))![axis];
    if (Math.abs(now - last) < 0.01) return now;
    last = now;
    await page.waitForTimeout(80);
  }
  return last;
}
