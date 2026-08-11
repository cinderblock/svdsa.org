/**
 * The live preview pane.
 *
 * The point of this feature is FIDELITY — it must render with the site's own
 * pipeline, not a lookalike. So these tests assert on what's actually inside the
 * iframe: that Markdown became the right HTML, that the raw-HTML islands the
 * migration preserved survive (they do NOT render in the WYSIWYG), and that
 * `cleanHtml` ran, since that's the step the site applies and a lookalike
 * renderer would skip.
 */

import { test, expect, type Page, type FrameLocator } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

const PATH = "content/pages/about.md";

const BODY = [
  "## Who we are",
  "",
  "We organize in the **South Bay**. See [our bylaws](/bylaws/).",
  "",
  "| Group | Meets |",
  "| ----- | ----- |",
  "| Housing | Monthly |",
  "",
  '<div class="wp-block-group" data-embed="1">A raw HTML island.</div>',
  "",
  '<a href="https://siliconvalleydsa.org/labor/" title="hover text">Labor</a>',
].join("\n");

async function mockEditor(page: Page, body = BODY) {
  const json = (b: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(b),
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
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(json({ base: "red", items: [PATH], nav: null, categories: [] })),
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
    r.fulfill(json({ meta: { [PATH]: { title: "About", url: "/about/" } } })),
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
        frontmatter: { title: "About Us", path: "/about/" },
        body,
      }),
    ),
  );
}

/** Open the page and switch to Preview, returning the iframe. */
async function openPreview(page: Page, body?: string): Promise<FrameLocator> {
  await mockEditor(page, body);
  await page.goto(EDITOR_URL);
  await page.getByLabel("Search content").fill("about");
  await page.getByRole("button", { name: /About/ }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator("iframe.preview");
  // The render is debounced, so wait for content rather than asserting blind.
  await expect(frame.locator(".prose")).toContainText("We organize", {
    timeout: 15_000,
  });
  return frame;
}

test.describe("live preview", () => {
  test("renders Markdown through the site's pipeline", async ({ page }) => {
    const frame = await openPreview(page);
    await expect(
      frame.getByRole("heading", { name: "Who we are" }),
    ).toBeVisible();
    await expect(frame.locator(".prose strong")).toHaveText("South Bay");
    // GFM: a pipe table is only a table if remark-gfm is in the pipeline.
    await expect(frame.locator(".prose table td").first()).toHaveText(
      "Housing",
    );
  });

  test("keeps the raw-HTML islands the WYSIWYG can't show", async ({
    page,
  }) => {
    // ~20 migrated files carry embeds and styled divs as raw HTML. rehype-raw is
    // what preserves them, and this is the only place an editor can see them.
    const frame = await openPreview(page);
    const island = frame.locator(".prose .wp-block-group");
    await expect(island).toHaveText("A raw HTML island.");
    await expect(island).toHaveAttribute("data-embed", "1");
  });

  test("applies cleanHtml — the step a lookalike renderer would skip", async ({
    page,
  }) => {
    const frame = await openPreview(page);
    const link = frame.locator('.prose a[href$="/labor/"]');
    // Absolute svdsa.org origin stripped to site-relative...
    await expect(link).toHaveAttribute("href", "/labor/");
    // ...and title= removed, since hover-only text is never acceptable here.
    expect(await link.getAttribute("title")).toBeNull();
  });

  test("shows the title the way a page does", async ({ page }) => {
    const frame = await openPreview(page);
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(
      "About Us",
    );
  });

  test("escapes a title containing markup", async ({ page }) => {
    await mockEditor(page);
    await page.goto(EDITOR_URL);
    await page.getByLabel("Search content").fill("about");
    await page.getByRole("button", { name: /About/ }).click();
    await page.locator("input.title").fill('<img src=x onerror="boom">');
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator("iframe.preview");
    await expect(frame.locator("h1")).toContainText("<img", {
      timeout: 15_000,
    });
    // Rendered as text, not as an element.
    await expect(frame.locator("h1 img")).toHaveCount(0);
  });

  test("reflects unsaved edits, and switching back keeps them", async ({
    page,
  }) => {
    const frame = await openPreview(page);
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await expect(page.locator(".raw")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".raw .view-lines")).toContainText("Who we are");

    // Type into the raw editor, then preview: the change must appear without
    // saving, which is the whole point of a live preview. Monaco's textarea is
    // synthetic and rejects fill(), so drive it the way a person would.
    await page.locator(".raw .view-lines").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("# Brand New Heading");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(frame.locator(".prose")).toContainText("Brand New Heading", {
      timeout: 15_000,
    });

    // And going back retains it rather than reverting to the loaded copy.
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await expect(page.locator(".raw .view-lines")).toContainText(
      "Brand New Heading",
    );
  });

  test("the preview is sandboxed away from the editor", async ({ page }) => {
    await openPreview(page);
    // No allow-same-origin and no allow-scripts: preview content cannot reach
    // back into the editor or run embedded <script> islands.
    await expect(page.locator("iframe.preview")).toHaveAttribute("sandbox", "");
  });
});
