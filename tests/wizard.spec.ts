/**
 * The new-content wizard, driven in a browser with `/api/*` stubbed.
 *
 * Asserts what the wizard actually SENDS, since the Worker builds the path from
 * that intent — and that the URL an editor is shown before committing matches
 * what they'll get, because that's the part no one can fix later without a
 * redirect.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";
import { planNewItem } from "../editor/src/content/newItem";

type Created = Record<string, unknown>;

async function mockEditor(page: Page, base = "red"): Promise<Created> {
  const created: Created = {};
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
    r.fulfill(json({ branches: ["red", "theme/faithful"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(
      json({
        base,
        items: ["content/pages/about.md", "content/pages/housing.md"],
        nav: null,
        categories: [
          { label: "WG - Housing", hue: 24 },
          { label: "Social", hue: 300 },
          { label: "SV DSA", note: "Carries almost no information." },
          { label: "Retired Thing", retired: true },
        ],
      }),
    ),
  );
  await page.route("**/api/status*", (r) =>
    r.fulfill(
      json({
        base,
        draft: `draft/e/${base}`,
        exists: false,
        changed: [],
        pr: null,
      }),
    ),
  );
  await page.route("**/api/meta*", (r) => r.fulfill(json({ meta: {} })));
  await page.route("**/api/create", async (r) => {
    Object.assign(created, JSON.parse(r.request().postData() ?? "{}"));
    // Answer with what the real Worker would, so the UI's follow-on open works.
    const planned = planNewItem(created as never);
    await r.fulfill(
      json({
        path: planned.path,
        url: planned.url,
        draft: Boolean((created as { draft?: boolean }).draft),
        branch: `draft/e/${base}`,
        commitSha: "abc",
        sha: "def",
        previewUrl: "https://example.invalid/",
      }),
    );
  });
  await page.route("**/api/item*", (r) =>
    r.fulfill(
      json({
        path: "content/events/2027/2027-05-01-may-day-march.md",
        ref: base,
        base,
        fromDraft: true,
        sha: "def",
        kind: "markdown",
        frontmatter: {
          title: "May Day March",
          path: "/event/2027-05-01-may-day-march/",
        },
        body: "Describe the event here.",
      }),
    ),
  );
  return created;
}

const openWizard = async (page: Page) => {
  await page.goto(EDITOR_URL);
  await page.getByRole("button", { name: "+ New" }).click();
  await expect(
    page.getByRole("heading", { name: "What are you adding?" }),
  ).toBeVisible();
};

test.describe("new-content wizard", () => {
  test("asks what kind of thing first, one-off vs repeating included", async ({
    page,
  }) => {
    await mockEditor(page);
    await openWizard(page);
    for (const label of [
      "Blog post",
      "One-off event",
      "Repeating meeting",
      "Page",
    ])
      await expect(
        page.getByRole("button", { name: new RegExp(label) }),
      ).toBeVisible();
  });

  test("shows the URL before anything is written", async ({ page }) => {
    await mockEditor(page);
    await openWizard(page);
    await page.getByRole("button", { name: /One-off event/ }).click();
    await page.getByLabel("Title").fill("May Day March");
    await page.getByLabel("Date").fill("2027-05-01");

    // The date belongs inside an event's slug — this is what the editor sees.
    await expect(page.locator(".wiz__url code")).toHaveText(
      "/event/2027-05-01-may-day-march/",
    );
  });

  test("creates a one-off event with the chosen categories", async ({
    page,
  }) => {
    const created = await mockEditor(page);
    await openWizard(page);
    await page.getByRole("button", { name: /One-off event/ }).click();
    await page.getByLabel("Title").fill("May Day March");
    await page.getByLabel("Date").fill("2027-05-01");
    await page.getByLabel("Starts").fill("11:00");
    await page
      .getByLabel("Where", { exact: true })
      .fill("Plaza de César Chávez");
    await page.getByRole("button", { name: "WG - Housing" }).click();

    await page.getByRole("button", { name: /Create one-off event/i }).click();
    await expect(page.locator(".msg.ok, .path")).toBeVisible();

    expect(created.kind).toBe("event");
    expect(created.title).toBe("May Day March");
    expect(created.date).toBe("2027-05-01");
    expect(created.startTime).toBe("11:00");
    expect(created.venue).toBe("Plaza de César Chávez");
    expect(created.categories).toEqual(["WG - Housing"]);
    // No path is ever sent: the Worker owns naming.
    expect(created).not.toHaveProperty("path");
  });

  test("offers only live categories, and surfaces their notes", async ({
    page,
  }) => {
    await mockEditor(page);
    await openWizard(page);
    await page.getByRole("button", { name: /Blog post/ }).click();

    await expect(
      page.getByRole("button", { name: "Retired Thing" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "SV DSA" }).click();
    await expect(page.locator(".wiz__note")).toContainText(
      "Carries almost no information",
    );
  });

  test("defaults to a draft on the production branch", async ({ page }) => {
    const created = await mockEditor(page, "red");
    await openWizard(page);
    await page.getByRole("button", { name: /Blog post/ }).click();
    await page.getByLabel("Title").fill("A Statement");

    const keep = page.getByRole("checkbox", { name: /Keep as a draft/ });
    await expect(keep).toBeChecked();
    await page.getByRole("button", { name: /Create blog post/i }).click();
    expect(created.draft).toBe(true);
  });

  test("no draft flag when working on a branch — the branch IS the staging", async ({
    page,
  }) => {
    const created = await mockEditor(page, "theme/faithful");
    await page.goto(EDITOR_URL);
    // Switch base away from production before opening the wizard.
    await page.getByRole("button", { name: /^Branch/ }).click();
    await page.getByRole("option", { name: "faithful" }).click();
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByRole("button", { name: /Blog post/ }).click();
    await page.getByLabel("Title").fill("Branch Work");

    await expect(
      page.getByRole("checkbox", { name: /Keep as a draft/ }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Create blog post/i }).click();
    expect(created.draft).toBe(false);
  });
});
