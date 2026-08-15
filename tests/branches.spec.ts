/**
 * The branch picker and branch browser, driven in a browser with `/api/*`
 * stubbed.
 *
 * The point of these is the thing a user came for: **the preview link for each
 * branch must be the one the Worker derived**, and switching branches must
 * actually re-list content against the new branch. Both are easy to break with
 * a refactor that still typechecks.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

const BRANCH_INFO = {
  production: "red",
  branches: [
    {
      name: "red",
      commit: {
        oid: "aaa1111",
        subject: "content: re-import from the WordPress WXR export",
        committedDate: new Date(Date.now() - 3 * 3600_000).toISOString(),
        author: "cinderblock",
      },
      ahead: 0,
      behind: 0,
      pull: null,
      // Production is served at the Worker's own hostname — NOT the
      // `red-site.…` branch alias, which Workers Builds never creates for the
      // production branch. See the Worker's /api/branch-info.
      previewUrl: "https://site.invalid/",
      isProduction: true,
      draft: null,
    },
    {
      name: "theme/faithful",
      commit: {
        oid: "bbb2222",
        subject: "theme: keep the original palette",
        committedDate: new Date(Date.now() - 4 * 86400_000).toISOString(),
        author: "cinderblock",
      },
      ahead: 12,
      behind: 4,
      pull: {
        number: 7,
        url: "https://github.invalid/pull/7",
        title: "Faithful theme",
        state: "OPEN",
        isDraft: false,
        baseRefName: "red",
      },
      previewUrl: "https://theme-faithful-site.invalid/",
      isProduction: false,
      draft: null,
    },
    {
      name: "draft/e/red",
      commit: {
        oid: "ccc3333",
        subject: "edit: about page",
        committedDate: new Date(Date.now() - 600_000).toISOString(),
        author: "e",
      },
      ahead: 1,
      behind: 0,
      pull: null,
      previewUrl: "https://draft-e-red-site.invalid/",
      isProduction: false,
      draft: { who: "e", base: "red", mine: true },
    },
  ],
};

/** Stub the Worker API; returns what the SPA asked for, for assertions. */
async function mockEditor(page: Page) {
  const seen: { listedBases: string[]; created: unknown[] } = {
    listedBases: [],
    created: [],
  };
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/me", (r) =>
    r.fulfill(
      json({
        email: "e@x",
        siteOrigin: "https://site.invalid",
        unprotected: null,
      }),
    ),
  );
  await page.route("**/api/branches", (r) =>
    r.fulfill(
      json({ branches: ["red", "theme/faithful", "theme/midnight-rose"] }),
    ),
  );
  await page.route("**/api/branch-info", (r) => r.fulfill(json(BRANCH_INFO)));
  await page.route("**/api/list*", (r) => {
    seen.listedBases.push(
      new URL(r.request().url()).searchParams.get("base") ?? "",
    );
    return r.fulfill(
      json({ base: "red", items: [], nav: null, categories: [] }),
    );
  });
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
  await page.route("**/api/branch", async (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    seen.created.push(body);
    await r.fulfill(json({ branch: body.name }));
  });
  return seen;
}

/** Open the branch browser through the header picker's footer action. */
async function openBrowser(page: Page) {
  await page.getByRole("button", { name: /^Branch/ }).click();
  await page.getByRole("button", { name: /Browse all branches/ }).click();
  await expect(page.getByRole("dialog", { name: "Branches" })).toBeVisible();
}

test.describe("branch picker", () => {
  test("replaces the native select and switches the base", async ({ page }) => {
    const seen = await mockEditor(page);
    await page.goto(EDITOR_URL);

    // The old native control is gone.
    await expect(page.locator("header select")).toHaveCount(0);

    const trigger = page.getByRole("button", { name: /^Branch/ });
    await expect(trigger).toContainText("red");
    await trigger.click();
    await page.getByRole("option", { name: "midnight-rose" }).click();

    await expect(trigger).toContainText("midnight-rose");
    await expect.poll(() => seen.listedBases).toContain("theme/midnight-rose");
  });

  test("filters, and picks with the keyboard", async ({ page }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    await page.getByRole("button", { name: /^Branch/ }).click();
    await page.getByRole("combobox", { name: "Filter branch" }).fill("mid");
    await expect(page.locator(".pick__pop").getByRole("option")).toHaveCount(1);

    await page.getByRole("combobox", { name: "Filter branch" }).press("Enter");
    await expect(page.getByRole("button", { name: /^Branch/ })).toContainText(
      "midnight-rose",
    );
  });

  test("Escape closes without changing the branch", async ({ page }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    await page.getByRole("button", { name: /^Branch/ }).click();
    await expect(page.getByRole("option", { name: "faithful" })).toBeVisible();
    await page.getByRole("combobox", { name: "Filter branch" }).press("Escape");

    await expect(page.locator(".pick__pop")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Branch/ })).toContainText(
      "red",
    );
  });
});

test.describe("branch browser", () => {
  test("links every branch to the preview the Worker derived", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    for (const b of BRANCH_INFO.branches) {
      const row = page.locator(`.br__row[data-branch="${b.name}"]`);
      await expect(
        row.getByRole("link", { name: /Open (preview|live site)/ }),
      ).toHaveAttribute("href", b.previewUrl);
    }
  });

  test("production links to the live site, not a branch alias", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    // Workers Builds gives the `<branch>-<worker>` alias only to NON-production
    // branches; `red` is served at the Worker's own hostname. Linking it to
    // red-site.… pointed at a host that need not resolve at all.
    const live = page
      .locator('.br__row[data-branch="red"]')
      .getByRole("link", { name: "Open live site ↗" });
    await expect(live).toHaveAttribute("href", "https://site.invalid/");

    // And the other rows genuinely are previews, alias and all.
    await expect(
      page
        .locator('.br__row[data-branch="theme/faithful"]')
        .getByRole("link", { name: "Open preview ↗" }),
    ).toHaveAttribute("href", "https://theme-faithful-site.invalid/");
  });

  test("shows what tells branches apart", async ({ page }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    const red = page.locator('.br__row[data-branch="red"]');
    await expect(red).toContainText("live site");

    const faithful = page.locator('.br__row[data-branch="theme/faithful"]');
    await expect(faithful).toContainText("12 ahead, 4 behind red");
    await expect(faithful).toContainText("theme: keep the original palette");
    await expect(faithful.getByRole("link", { name: /PR #7/ })).toHaveAttribute(
      "href",
      "https://github.invalid/pull/7",
    );

    // Draft branches are listed too, labelled as workspaces rather than
    // destinations — they were entirely absent from the old picker.
    const draft = page.locator('.br__row[data-branch="draft/e/red"]');
    await expect(draft).toContainText("your draft");
    await expect(draft).toContainText("branched from red");
  });

  test("'Edit this branch' switches the editor to it", async ({ page }) => {
    const seen = await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    await page
      .locator('.br__row[data-branch="theme/faithful"]')
      .getByRole("button", { name: "Edit this branch" })
      .click();

    await expect(page.getByRole("dialog", { name: "Branches" })).toBeHidden();
    await expect(page.getByRole("button", { name: /^Branch/ })).toContainText(
      "faithful",
    );
    await expect.poll(() => seen.listedBases).toContain("theme/faithful");
  });

  test("filter narrows the list", async ({ page }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    await expect(page.locator(".br__row")).toHaveCount(3);
    await page
      .getByRole("searchbox", { name: "Filter branches" })
      .fill("theme");
    await expect(page.locator(".br__row")).toHaveCount(1);
  });

  test("creates a branch off the current one, no window.prompt", async ({
    page,
  }) => {
    const seen = await mockEditor(page);
    await page.goto(EDITOR_URL);
    await openBrowser(page);

    await page.getByLabel(/New branch off/).fill("theme/experiment");
    await page.getByRole("button", { name: "Create" }).click();

    await expect
      .poll(() => seen.created)
      .toContainEqual({ name: "theme/experiment", from: "red" });
    await expect(page.getByRole("button", { name: /^Branch/ })).toContainText(
      "experiment",
    );
  });

  test("?branches opens the browser directly", async ({ page }) => {
    await mockEditor(page);
    await page.goto(`${EDITOR_URL}/?branches`);
    await expect(page.getByRole("dialog", { name: "Branches" })).toBeVisible();
  });
});
