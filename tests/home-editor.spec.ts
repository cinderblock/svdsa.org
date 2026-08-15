/**
 * Editing the home page by typing on it.
 *
 * The home page has no body — its words are fourteen frontmatter strings that a
 * fixed layout renders. Through the generic editor that was fourteen unlabelled
 * text boxes beside an empty document, so it gets its own pane which renders the
 * SITE's own route (app/routes/home.tsx) with each word made editable.
 *
 * These tests assert the two things that make it worth having: that what's in
 * the frame is really the site's home page, and that typing on it ends up in the
 * frontmatter that would be committed.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";

const PATH = "content/pages/home.md";
const ABOUT = "content/pages/about.md";

const FRONTMATTER = {
  slug: "home",
  path: "/",
  title: "Home",
  ctaPrimary: "Join us",
  ctaEvents: "See upcoming events",
  ctaDonate: "Donate",
  photosHeading: "In the streets",
  eventsHeading: "Upcoming events",
  groupsHeading: "Where the work happens",
  groupsIntro: "Members organize through working groups.",
  dispatchesHeading: "Latest dispatches",
  closingHeading: "Ready to get organized?",
  closingIntro: "Come to an event.",
};

/**
 * The plate's welcome, as a body. Deliberately not the shipped copy: these
 * tests should fail when the pane stops rendering the file it was handed, not
 * when the chapter rewords its own front page.
 */
const BODY = [
  "# `Sample Valley`",
  "",
  "## Democratic Socialists of America",
  "",
  "---",
  "",
  "We're **not** a political party — we're a community.",
].join("\n");

const json = (b: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(b),
});

/** Captures whatever the editor last tried to save. */
type Saved = { frontmatter?: Record<string, unknown>; body?: string };

async function mockEditor(page: Page): Promise<{ last: Saved }> {
  const captured: { last: Saved } = { last: {} };
  await page.route("**/api/me", (r) =>
    r.fulfill(json({ email: "e@x", siteOrigin: "", unprotected: null })),
  );
  await page.route("**/api/branches", (r) =>
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(
      json({ base: "red", items: [ABOUT, PATH], nav: null, categories: [] }),
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
  await page.route("**/api/meta*", (r) =>
    r.fulfill(
      json({
        meta: {
          [PATH]: { title: "Home", url: "/" },
          [ABOUT]: { title: "About", url: "/about/" },
        },
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
        frontmatter: FRONTMATTER,
        body: BODY,
      }),
    ),
  );
  await page.route("**/api/save", (r) => {
    captured.last = r.request().postDataJSON() as Saved;
    return r.fulfill(json({ branch: "draft/e/red", sha: "def", lint: [] }));
  });
  return captured;
}

/** Open the home page in the editor and return its frame. */
async function openHome(page: Page) {
  await page.goto(EDITOR_URL);
  await page.getByRole("button", { name: /Home/ }).first().click();
  const frame = page.frameLocator("iframe.preview");
  await expect(
    frame.getByRole("textbox", { name: "Closing: Heading", exact: true }),
  ).toHaveText(FRONTMATTER.closingHeading, { timeout: 20_000 });
  return frame;
}

test.describe("the home page editor", () => {
  test("leads the file list instead of hiding in Other pages", async ({
    page,
  }) => {
    // The tree mirrors the URL for every page but this one: home.md serves "/",
    // so a filename-derived URL ("/home/") matches nothing in the site's main
    // nav and the page used to fall into the collapsed "Other pages" group.
    await mockEditor(page);
    await page.goto(EDITOR_URL);

    const main = page.locator("details.grp--main");
    await expect(main).toContainText("Main pages");
    const first = main.locator("button.entry").first();
    await expect(first).toContainText("Home");
    // "Site order" means the site's order here, not the alphabet — otherwise
    // Home sorts after About.
    await expect(first).toContainText("/");
  });

  test("shows the real home page, not a document", async ({ page }) => {
    await mockEditor(page);
    const frame = await openHome(page);

    // Fidelity: these come from the site's OWN route and its config, none of
    // them from the frontmatter being edited. A lookalike wouldn't have them.
    await expect(frame.locator("img[alt*='emblem' i]")).toBeVisible();
    await expect(
      frame.getByRole("heading", { name: "Where the work happens" }),
    ).toBeVisible();

    // The plate is the file's BODY, rendered through the site's own markdown
    // pipeline — bold and all, which is the whole reason it isn't a slot.
    const plate = frame.locator(".plate .prose");
    await expect(plate.locator("h1")).toHaveText("Sample Valley");
    await expect(plate.locator("strong")).toHaveText("not");

    // Page is the default and its own tab; the body gets the ordinary two.
    await expect(page.getByRole("button", { name: "Page" })).toHaveClass(/on/);
    await expect(page.getByRole("button", { name: "Rich text" })).toHaveCount(
      1,
    );
    // Preview would be a worse Page — the body without the page around it.
    await expect(page.getByRole("button", { name: "Preview" })).toHaveCount(0);
  });

  test("the plate follows the body as it is typed", async ({ page }) => {
    // The point of this pane: what the words will look like where they land,
    // not in a document view. So an unsaved body edit has to reach the plate.
    await mockEditor(page);
    const frame = await openHome(page);

    await page.getByRole("button", { name: "Source" }).click();
    // Monaco is lazy-loaded and only takes keystrokes once focused.
    const source = page.locator(".pane .monaco-editor").first();
    await expect(source).toBeVisible({ timeout: 30_000 });
    await source.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("## Solidarity Forever");

    await page.getByRole("button", { name: "Page" }).click();
    await expect(frame.locator(".plate .prose h2")).toHaveText(
      "Solidarity Forever",
      { timeout: 20_000 },
    );
  });

  test("typing on the page is what gets saved", async ({ page }) => {
    const captured = await mockEditor(page);
    const frame = await openHome(page);

    await frame
      .getByRole("textbox", { name: "Working groups: Heading", exact: true })
      .fill("Where the work gets done");
    await frame
      .getByRole("textbox", { name: "Closing: Heading", exact: true })
      .fill("Come organize with us");

    await page.getByRole("button", { name: /Save draft/ }).click();
    await expect(page.locator(".msg.ok")).toBeVisible({ timeout: 15_000 });

    expect(captured.last.frontmatter).toMatchObject({
      groupsHeading: "Where the work gets done",
      closingHeading: "Come organize with us",
      // Untouched slots round-trip verbatim rather than being rebuilt.
      ctaPrimary: FRONTMATTER.ctaPrimary,
      groupsIntro: FRONTMATTER.groupsIntro,
    });
    // And the body it never touched goes back unchanged.
    expect(captured.last.body).toBe(BODY);
  });

  test("a slot that takes a newline would produce broken YAML, so it can't", async ({
    page,
  }) => {
    await mockEditor(page);
    const frame = await openHome(page);

    const intro = frame.getByRole("textbox", {
      name: "Working groups: Intro",
      exact: true,
    });
    await intro.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second line");

    expect(await intro.textContent()).not.toContain("\n");
  });

  test("clearing a slot shows the default the page will actually render", async ({
    page,
  }) => {
    // app/lib/home.ts falls back per field, so a blank slot is not a blank
    // heading — and the editor has to say so, or it looks broken.
    await mockEditor(page);
    const frame = await openHome(page);

    const heading = frame.getByRole("textbox", {
      name: "Closing: Heading",
      exact: true,
    });
    await heading.fill("");
    // Blur, which is when the resolved value goes back in.
    await frame
      .getByRole("textbox", { name: "Hero: Join button", exact: true })
      .click();
    await expect(heading).toHaveText("Ready to get organized?");
  });

  test("the copy fields aren't also duplicated in the metadata form", async ({
    page,
  }) => {
    await mockEditor(page);
    await openHome(page);
    // Two controls for one value is how you get a stale one. Advanced plumbing
    // (slug, path) still lives in the form.
    for (const key of ["groupsHeading", "ctaDonate", "closingIntro"])
      await expect(
        page.locator(`.fmField:has(> span:text-is("${key}"))`),
      ).toHaveCount(0);
  });
});
