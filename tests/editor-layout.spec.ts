/**
 * The editor's two-pane shell.
 *
 * The sidebar and the editing column must scroll INDEPENDENTLY. This is easy to
 * break and invisible to typecheck: the shell is a grid whose row, left
 * implicit, auto-sizes to whichever column has more content. When that happens
 * both panes grow past the viewport, the page itself gets the only scrollbar,
 * and the sidebar's own `overflow: auto` never has anything to do — so dragging
 * the file list scrolls the document out from under the editor.
 *
 * Asserted on the real layout (long file list, long body) rather than on the
 * CSS, so any future way of reintroducing it is caught too.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

/** Enough files that the sidebar cannot possibly fit in a viewport. */
const PATHS = Array.from(
  { length: 120 },
  (_, i) => `content/pages/page-${String(i).padStart(3, "0")}.md`,
);
const PATH = PATHS[0]!;

/** content/pages/page-000.md → /page-000/ (the tree mirrors the site's URLs). */
const urlFor = (p: string) =>
  "/" + p.replace(/^content\/pages\//, "").replace(/\.md$/, "") + "/";

/**
 * Put every page under a nav section, so the sidebar renders them expanded.
 * Ungrouped pages land in a collapsed "Other pages" and the list wouldn't
 * overflow — the very thing being measured.
 */
const NAV = {
  resources: PATHS.map((p, i) => ({ label: `Page ${i}`, to: urlFor(p) })),
};

/** Enough body that the editor column can't fit either. */
const BODY = Array.from(
  { length: 200 },
  (_, i) => `Paragraph ${i} of a document that is far taller than the window.`,
).join("\n\n");

async function mockEditor(page: Page) {
  const json = (b: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(b),
  });
  await page.route("**/api/me", (r) =>
    r.fulfill(json({ email: "e@x", siteOrigin: "", unprotected: null })),
  );
  await page.route("**/api/branches", (r) =>
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(json({ base: "red", items: PATHS, nav: NAV, categories: [] })),
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
        meta: Object.fromEntries(
          PATHS.map((p, i) => [p, { title: `Page ${i}`, url: urlFor(p) }]),
        ),
      }),
    ),
  );
  await page.route("**/api/item*", (r) =>
    r.fulfill(
      json({
        path: PATH,
        ref: "red",
        base: "red",
        fromDraft: false,
        sha: "abc",
        kind: "markdown",
        frontmatter: { title: "Page 0", path: "/page-0/" },
        body: BODY,
      }),
    ),
  );
}

test.describe("editor shell layout", () => {
  test("the file list scrolls on its own, not the whole page", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(EDITOR_URL);

    const list = page.locator("#list");
    await expect(list).toBeVisible();
    // Wait for the groups to populate — an empty sidebar would pass vacuously.
    await expect(page.locator("#list .entry").first()).toBeVisible();

    const box = await list.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
      docScroll: document.documentElement.scrollHeight,
      docClient: document.documentElement.clientHeight,
    }));

    // There is more list than fits: the premise of the test.
    expect(box.scroll).toBeGreaterThan(box.client);
    // …and it is the SIDEBAR that overflows, not the document.
    expect(box.docScroll).toBeLessThanOrEqual(box.docClient + 1);

    // Scrolling the sidebar must actually move the sidebar and leave the
    // document alone — the symptom a reader would notice.
    await list.evaluate((el) => el.scrollBy(0, 400));
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("opening a long document does not make the page scroll", async ({
    page,
  }) => {
    await mockEditor(page);
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(EDITOR_URL);
    // Rows carry a second line of detail, so match on the title, not exactly.
    await page.locator("#list .entry").first().click();

    await expect(page.locator(".pane")).toBeVisible();
    // The editing column owns its overflow; the shell stays put.
    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    }));
    expect(doc.scroll).toBeLessThanOrEqual(doc.client + 1);
  });
});
