/**
 * The zone label is the control.
 *
 * Times render in the chapter's zone by default — that's what the prerendered
 * HTML holds, and it's right for most readers. A member elsewhere clicks the
 * label, picks their own, and it sticks: localStorage, applied on every later
 * load once the page hydrates.
 */

import { test, expect, type Page } from "@playwright/test";

/**
 * Open the menu, tolerating a page that hasn't hydrated yet.
 *
 * The button is in the prerendered HTML but does nothing until React attaches
 * — same as the view tabs and the filter chips. Clicks before that are silently
 * dropped, so this retries rather than racing. Harmless once hydrated: a click
 * that already opened the menu short-circuits before clicking again.
 */
const openPicker = async (page: Page) => {
  const btn = page.getByRole("button", { name: /change timezone/i }).first();
  await expect
    .poll(
      async () => {
        if (await page.getByRole("menu").isVisible()) return true;
        await btn.click();
        return page.getByRole("menu").isVisible();
      },
      { timeout: 20_000 },
    )
    .toBe(true);
};

/** The first event card's time, once React owns the page. */
const firstTime = (page: Page) => page.locator(".ecard__time").first();

test.describe("Timezone picker", () => {
  test("labels times with the chapter's zone by default", async ({ page }) => {
    await page.goto("/calendar");
    // Pacific, and seasonal — PST in winter, PDT in summer. Either is correct;
    // asserting the literal string of whichever season CI runs in is not.
    await expect(
      page.getByRole("button", { name: /change timezone/i }).first(),
    ).toHaveText(/^P[SD]T/);
  });

  test("switching zones re-renders every time on the page", async ({
    page,
  }) => {
    await page.goto("/calendar");
    const before = await firstTime(page).textContent();

    await openPicker(page);
    await page.getByPlaceholder("Any other timezone").fill("Tokyo");
    await page
      .getByRole("menuitemradio", { name: /Asia\/Tokyo/ })
      .first()
      .click();

    // The menu closes and the label follows the choice.
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(
      page.getByRole("button", { name: /change timezone/i }).first(),
    ).toHaveText(/GMT\+9/);

    // ...and the times themselves moved, which is the actual point.
    await expect(firstTime(page)).not.toHaveText(before ?? "");
  });

  test("the choice survives a reload", async ({ page }) => {
    await page.goto("/calendar");
    await openPicker(page);
    await page.getByPlaceholder("Any other timezone").fill("New_York");
    await page
      .getByRole("menuitemradio", { name: /America\/New_York/ })
      .first()
      .click();
    const chosen = await firstTime(page).textContent();

    await page.reload();
    // Renders as Pacific first (that's the prerendered HTML), then corrects —
    // so this has to wait rather than sample immediately.
    await expect(firstTime(page)).toHaveText(chosen ?? "", { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /change timezone/i }).first(),
    ).toHaveText(/E[SD]T/);
  });

  test("going back to chapter time forgets the preference", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await openPicker(page);
    await page.getByPlaceholder("Any other timezone").fill("New_York");
    await page
      .getByRole("menuitemradio", { name: /America\/New_York/ })
      .first()
      .click();

    await openPicker(page);
    await page.getByRole("menuitemradio", { name: /Chapter time/ }).click();

    await expect(
      page.getByRole("button", { name: /change timezone/i }).first(),
    ).toHaveText(/^P[SD]T/);
    // Nothing left in storage — the default isn't a stored value.
    expect(
      await page.evaluate(() => window.localStorage.getItem("svdsa:timezone")),
    ).toBeNull();
  });

  test("Escape closes the menu", async ({ page }) => {
    // It's a menu, not a modal: the dismiss gesture people already know has to
    // work, or on a phone it's a trap.
    await page.goto("/calendar");
    await openPicker(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  });

  test("the event page labels its own time and converts it", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await page.locator("a.ecard").first().click();
    await expect(page).toHaveURL(/\/event\//, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "When" })).toBeVisible({
      timeout: 30_000,
    });

    const when = page.locator(".event-detail-meta p").first();
    const before = await when.textContent();
    await openPicker(page);
    await page.getByPlaceholder("Any other timezone").fill("Tokyo");
    await page
      .getByRole("menuitemradio", { name: /Asia\/Tokyo/ })
      .first()
      .click();
    await expect(when).not.toHaveText(before ?? "");
  });
});
