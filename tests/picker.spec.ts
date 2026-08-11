/**
 * The shared Picker, at the two call sites that replaced a native `<select>`:
 * the sidebar's sort control and the wizard's parent-page field.
 *
 * What's worth asserting is the contract that isn't obvious from the markup:
 * the filter box appears only when the list is long enough to need it, and the
 * control's accessible name is its own — a `<label>` wrapped around the
 * trigger `<button>` would silently fold the visible caption into the name
 * instead of labelling it, which is a bug this editor has shipped before.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

/** Enough pages that the parent picker crosses the filter threshold. */
const PAGES = [
  "about",
  "bylaws",
  "contact",
  "donate",
  "ecosocialist",
  "housing",
  "join",
  "labor",
  "mutual-aid",
  "political-education",
  "political-education/bookclub",
];

async function mockEditor(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/me", (r) =>
    r.fulfill(
      json({
        email: "e@x",
        siteOrigin: "https://s.invalid",
        unprotected: null,
      }),
    ),
  );
  await page.route("**/api/branches", (r) =>
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(
      json({
        base: "red",
        items: PAGES.map((p) => `content/pages/${p}.md`),
        nav: null,
        categories: [],
      }),
    ),
  );
  await page.route("**/api/status*", (r) =>
    r.fulfill(
      json({
        base: "red",
        draft: "draft/e/red",
        exists: false,
        changed: [],
        pr: null,
      }),
    ),
  );
  await page.route("**/api/meta*", (r) => r.fulfill(json({ meta: {} })));
}

test.describe("sidebar sort picker", () => {
  test("is not a native select, and offers no filter for four options", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    await expect(page.locator("#list select")).toHaveCount(0);
    await page.getByRole("button", { name: "Sort content" }).click();

    // A search box over four options is noise, so `filterable` stays off.
    await expect(page.locator(".pick__pop").getByRole("combobox")).toHaveCount(
      0,
    );
    await expect(page.locator(".pick__pop").getByRole("option")).toHaveCount(4);
  });

  test("its accessible name is its own, not the caption beside it", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    // Exactly one match, named "Sort content" — not "Sort Sort content".
    const trigger = page.getByRole("button", { name: "Sort content" });
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAccessibleName("Sort content");
  });

  test("picks with the keyboard and returns focus to the trigger", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    const trigger = page.getByRole("button", { name: "Sort content" });
    await trigger.click();
    // No filter box here, so the listbox itself takes the keys.
    await page.locator(".pick__list").press("ArrowDown");
    await page.locator(".pick__list").press("Enter");

    await expect(trigger).toContainText("A–Z");
    await expect(page.locator(".pick__pop")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("wizard parent picker", () => {
  async function openPageForm(page: Page) {
    await page.goto(EDITOR_URL);
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByRole("button", { name: /Page/ }).click();
    await page.getByLabel("Title").fill("Tenant Rights");
  }

  test("offers a filter once the list is long, and sets the parent", async ({
    page,
  }) => {
    await mockEditor(page);
    await openPageForm(page);

    // Top level by default — the previewed URL proves what the wizard will send.
    await expect(page.locator(".wiz__url code")).toHaveText("/tenant-rights/");

    await page.getByRole("button", { name: "Inside another page" }).click();
    const filter = page.locator(".pick__pop").getByRole("combobox");
    await expect(filter).toBeVisible();

    await filter.fill("bookclub");
    await expect(page.locator(".pick__pop").getByRole("option")).toHaveCount(1);
    await filter.press("Enter");

    await expect(page.locator(".wiz__url code")).toHaveText(
      "/political-education/bookclub/tenant-rights/",
    );
  });

  test("can be put back to Top level", async ({ page }) => {
    await mockEditor(page);
    await openPageForm(page);

    await page.getByRole("button", { name: "Inside another page" }).click();
    await page.getByRole("option", { name: "/housing/" }).click();
    await expect(page.locator(".wiz__url code")).toHaveText(
      "/housing/tenant-rights/",
    );

    await page.getByRole("button", { name: "Inside another page" }).click();
    await page.getByRole("option", { name: "Top level" }).click();
    await expect(page.locator(".wiz__url code")).toHaveText("/tenant-rights/");
  });
});
