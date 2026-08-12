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
  kicker: "Silicon Valley · South Bay",
  headline: "Building working-class power,",
  headlineTwo: "for the many — not the few.",
  lead: "We're not a political party — we're a community.",
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
        body: "",
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
    frame.getByRole("textbox", { name: "Hero: Headline", exact: true }),
  ).toHaveText(FRONTMATTER.headline, { timeout: 20_000 });
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
    await expect(frame.locator("img[alt*='solidarity' i]")).toBeVisible();
    await expect(
      frame.getByRole("heading", { name: "Where the work happens" }),
    ).toBeVisible();
    await expect(frame.locator(".hero__title")).toContainText(
      FRONTMATTER.headlineTwo,
    );

    // One mode, because the other three have nothing to show for this file.
    await expect(page.getByRole("button", { name: "Page" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Rich text" })).toHaveCount(
      0,
    );
  });

  test("typing on the page is what gets saved", async ({ page }) => {
    const captured = await mockEditor(page);
    const frame = await openHome(page);

    await frame
      .getByRole("textbox", { name: "Hero: Headline", exact: true })
      .fill("Building a better South Bay,");
    await frame
      .getByRole("textbox", { name: "Closing: Heading", exact: true })
      .fill("Come organize with us");

    await page.getByRole("button", { name: /Save draft/ }).click();
    await expect(page.locator(".msg.ok")).toBeVisible({ timeout: 15_000 });

    expect(captured.last.frontmatter).toMatchObject({
      headline: "Building a better South Bay,",
      closingHeading: "Come organize with us",
      // Untouched slots round-trip verbatim rather than being rebuilt.
      kicker: FRONTMATTER.kicker,
      lead: FRONTMATTER.lead,
    });
  });

  test("a slot that takes a newline would produce broken YAML, so it can't", async ({
    page,
  }) => {
    await mockEditor(page);
    const frame = await openHome(page);

    const lead = frame.getByRole("textbox", {
      name: "Hero: Lead paragraph",
      exact: true,
    });
    await lead.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second line");

    expect(await lead.textContent()).not.toContain("\n");
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
      .getByRole("textbox", { name: "Hero: Kicker", exact: true })
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
    for (const key of ["headline", "kicker", "closingIntro"])
      await expect(
        page.locator(`.fmField:has(> span:text-is("${key}"))`),
      ).toHaveCount(0);
  });
});
