/**
 * Editor UI tests, focused on the recurrence widget — the control that lets a
 * non-technical member reschedule a meeting without seeing an RRULE.
 *
 * The real editor Worker needs GitHub App credentials, so `/api/*` is stubbed
 * here. That keeps these tests hermetic while still driving the actual SPA, and
 * lets us assert the exact frontmatter that WOULD be committed.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

const SERIES_PATH = "content/events/sjfreestore.md";

/** Frontmatter of a real recurring series (3rd Saturday monthly). */
const seriesFrontmatter = {
  id: "10000996",
  slug: "sjfreestore",
  path: "/event/sjfreestore/",
  title: "San José Free Store",
  start: "2026-08-15 14:00:00",
  end: "2026-08-15 18:00:00",
  allDay: false,
  timezone: "America/Los_Angeles",
  isVirtual: false,
  organizer: "Silicon Valley DSA",
  categories: ["newbie-friendly", "SV DSA", "WG - Mutual Aid"],
  recurrence: { rrule: "FREQ=MONTHLY;BYDAY=3SA" },
};

/** Stub the Worker API and capture what a save would commit. */
async function mockEditor(
  page: Page,
  frontmatter: Record<string, unknown> = seriesFrontmatter,
) {
  const saved: { frontmatter?: Record<string, unknown> } = {};
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/me", (r) => r.fulfill(json({ email: "e@x" })));
  await page.route("**/api/branches", (r) =>
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(json({ base: "red", items: [SERIES_PATH], nav: null })),
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
  await page.route("**/api/meta*", (r) =>
    r.fulfill(
      json({
        meta: {
          [SERIES_PATH]: {
            title: String(frontmatter.title),
            url: String(frontmatter.path ?? ""),
            recurs: Boolean(frontmatter.recurrence),
          },
        },
      }),
    ),
  );
  await page.route("**/api/item*", (r) =>
    r.fulfill(
      json({
        path: SERIES_PATH,
        ref: "red",
        base: "red",
        fromDraft: false,
        kind: "markdown",
        frontmatter,
        body: "The Free Store is free.",
        sha: "abc",
      }),
    ),
  );
  await page.route("**/api/save", async (r) => {
    saved.frontmatter = JSON.parse(r.request().postData() ?? "{}").frontmatter;
    await r.fulfill(
      json({
        branch: "draft/e/red",
        commitSha: "def",
        previewUrl: "https://example.invalid/",
        lint: [],
        autofixed: 0,
      }),
    );
  });
  return saved;
}

/** Open the editor and load the stubbed series. */
async function openSeries(page: Page) {
  await page.goto(EDITOR_URL);
  await page.getByRole("button", { name: /Free Store/ }).click();
  await expect(
    page.getByRole("switch", { name: "This event repeats" }),
  ).toBeVisible();
}

test.describe("editor: recurrence widget", () => {
  test("shows an existing rule in plain language, not as JSON", async ({
    page,
  }) => {
    await mockEditor(page);
    await openSeries(page);

    // The pattern is described, and the raw rule is NOT dumped on screen.
    await expect(page.getByText("3rd Saturday monthly")).toBeVisible();
    await expect(page.getByText("FREQ=MONTHLY")).toHaveCount(0);

    // Controls reflect the stored rule.
    await expect(page.getByLabel("Repeats", { exact: true })).toHaveValue(
      "MONTHLY",
    );
    await expect(page.getByRole("button", { name: "Sat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // And it previews real upcoming dates.
    const preview = page.locator(".rec__preview li");
    expect(await preview.count()).toBeGreaterThan(2);
    await expect(preview.first()).toContainText(/Sat/);
  });

  test("saving an untouched series does not rewrite its rule", async ({
    page,
  }) => {
    const saved = await mockEditor(page);
    await openSeries(page);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();

    expect(saved.frontmatter?.recurrence).toEqual({
      rrule: "FREQ=MONTHLY;BYDAY=3SA",
    });
  });

  test("an editor can cancel one occurrence (EXDATE)", async ({ page }) => {
    const saved = await mockEditor(page);
    await openSeries(page);

    await page.getByLabel("Skip a date").fill("2026-12-19");
    await page.getByRole("button", { name: "Skip", exact: true }).click();

    // Shown as a chip, and removed from the previewed dates.
    await expect(page.locator(".rec__chip--skip")).toContainText(
      "Dec 19, 2026",
    );
    await expect(page.locator(".rec__preview")).not.toContainText(
      "Dec 19, 2026",
    );

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();
    expect(saved.frontmatter?.recurrence).toEqual({
      rrule: "FREQ=MONTHLY;BYDAY=3SA",
      exdate: ["2026-12-19"],
    });
  });

  test("an editor can move an occurrence (EXDATE + RDATE)", async ({
    page,
  }) => {
    const saved = await mockEditor(page);
    await openSeries(page);

    await page.getByLabel("Skip a date").fill("2026-12-19");
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.getByLabel("Add an extra date").fill("2026-12-12");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.locator(".rec__preview")).toContainText("Dec 12, 2026");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();
    expect(saved.frontmatter?.recurrence).toEqual({
      rrule: "FREQ=MONTHLY;BYDAY=3SA",
      exdate: ["2026-12-19"],
      rdate: ["2026-12-12"],
    });
  });

  test("changing the pattern updates the rule and the preview", async ({
    page,
  }) => {
    const saved = await mockEditor(page);
    await openSeries(page);

    // Monthly → weekly, every other week.
    await page.getByLabel("Repeats", { exact: true }).selectOption("WEEKLY");
    await page.getByLabel("How often").selectOption("2");
    await expect(page.getByText("Every other Saturday")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();
    expect(saved.frontmatter?.recurrence).toEqual({
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA",
    });
  });

  test("a one-off event can be turned into a repeating one", async ({
    page,
  }) => {
    const { recurrence, ...oneOff } = seriesFrontmatter;
    void recurrence;
    const saved = await mockEditor(page, oneOff);
    await openSeries(page);

    // Off by default, with no rule.
    const toggle = page.getByRole("switch", { name: "This event repeats" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();

    // Defaults to weekly on the event's own weekday (2026-08-15 is a Saturday).
    await expect(page.getByText("Every Saturday")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();
    expect(saved.frontmatter?.recurrence).toEqual({
      rrule: "FREQ=WEEKLY;BYDAY=SA",
    });
  });

  test("repetition can be turned off entirely", async ({ page }) => {
    const saved = await mockEditor(page);
    await openSeries(page);

    await page.getByRole("switch", { name: "This event repeats" }).click();
    await expect(page.locator(".rec__preview")).toHaveCount(0);

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();
    // The key is dropped, not set to null — the event becomes a one-off.
    expect(saved.frontmatter && "recurrence" in saved.frontmatter).toBe(false);
  });
});

test.describe("editor: finding content", () => {
  /** A richer stub: several pages, an event series, a post, and site nav. */
  async function mockLibrary(page: Page) {
    const json = (b: unknown) => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(b),
    });
    const items = [
      "content/pages/about.md",
      "content/pages/housing.md",
      "content/pages/tech-and-data.md",
      "content/pages/voters-guide.md",
      "content/pages/some-old-page.md",
      "content/events/sjfreestore.md",
      "content/events/2026/2026-08-09-dsa-101.md",
      "content/posts/2026/2026-05-02-convention.md",
      "content/config/navigation.json.md",
    ];
    await page.route("**/api/me", (r) =>
      r.fulfill(json({ email: "e@x", siteOrigin: "https://site.test" })),
    );
    await page.route("**/api/branches", (r) =>
      r.fulfill(json({ branches: ["red"] })),
    );
    await page.route("**/api/status*", (r) =>
      r.fulfill(
        json({ base: "red", draft: "d", exists: false, changed: [], pr: null }),
      ),
    );
    await page.route("**/api/list*", (r) =>
      r.fulfill(
        json({
          base: "red",
          items,
          nav: {
            workingGroups: [{ label: "Housing", to: "/housing/" }],
            committees: [{ label: "Tech & Data", to: "/tech-and-data/" }],
            resources: [{ label: "Voters' Guide", to: "/voters-guide/" }],
          },
        }),
      ),
    );
    await page.route("**/api/meta*", (r) => {
      const dir = new URL(r.request().url()).searchParams.get("dir") ?? "";
      const meta: Record<string, unknown> = {};
      for (const p of items.filter((p) => p.startsWith(dir + "/"))) {
        const stem = p.split("/").pop()!.replace(".md", "");
        meta[p] = {
          title: stem.replace(/-/g, " ").replace(/^\d{4} \d{2} \d{2} /, ""),
          url: p.startsWith("content/pages/") ? `/${stem}/` : undefined,
          recurs: p === "content/events/sjfreestore.md",
        };
      }
      return r.fulfill(json({ meta }));
    });
    await page.route("**/api/item*", (r) => {
      const p = new URL(r.request().url()).searchParams.get("path");
      return r.fulfill(
        json({
          path: p,
          ref: "red",
          base: "red",
          fromDraft: false,
          kind: "markdown",
          frontmatter: { title: "Opened", path: "/about/" },
          body: "hi",
          sha: "s",
        }),
      );
    });
  }

  test("groups pages the way the site is organised", async ({ page }) => {
    await mockLibrary(page);
    await page.goto(EDITOR_URL);

    // Site sections, not repo folders.
    for (const label of [
      "Main pages",
      "Working groups",
      "Committees",
      "Resources",
      "Recurring meetings",
    ])
      await expect(
        page.locator("#list summary").filter({ hasText: label }),
      ).toHaveCount(1);

    // The Housing page sits under Working groups because the site's nav says so.
    const wg = page.locator("details.grp--wg");
    await expect(wg.getByRole("button", { name: /housing/i })).toBeVisible();
    // Pages show their live URL as the detail line.
    await expect(wg.locator(".entry__detail").first()).toHaveText("/housing/");
  });

  test("search matches titles and URLs, and sorting is offered", async ({
    page,
  }) => {
    await mockLibrary(page);
    await page.goto(EDITOR_URL);
    await expect(page.getByLabel("Sort content")).toBeVisible();

    await page.getByLabel("Search content").fill("voters");
    await expect(
      page.locator("#list .entry").filter({ hasText: /voters/i }),
    ).toHaveCount(1);
    await expect(
      page.locator("#list .entry").filter({ hasText: /housing/i }),
    ).toHaveCount(0);
  });

  test("?url= opens the file for a live-site page (the ?edit jump)", async ({
    page,
  }) => {
    await mockLibrary(page);
    await page.goto(`${EDITOR_URL}/?url=%2Fabout%2F`);
    // Lands with that page already open for editing.
    await expect(page.locator(".path")).toContainText("content/pages/about.md");
  });

  test("?path= opens a repo path directly", async ({ page }) => {
    await mockLibrary(page);
    await page.goto(`${EDITOR_URL}/?path=content%2Fevents%2Fsjfreestore.md`);
    await expect(page.locator(".path")).toContainText(
      "content/events/sjfreestore.md",
    );
  });
});
