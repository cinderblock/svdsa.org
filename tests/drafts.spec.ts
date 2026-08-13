/**
 * Draft content must not be published.
 *
 * `draft: true` is how an editor lands unfinished work on the production branch
 * without making it public — so a regression here doesn't just break a page, it
 * publishes something the chapter hadn't decided to say yet.
 *
 * Two committed canaries (`content/posts/2027/2027-01-01-draft-canary.md` and
 * `content/events/2027/draft-canary-event.md`) are permanent fixtures. Between
 * them they cover every output a draft could leak into. These tests assert
 * absence from all of them; the canaries also prove the tests aren't vacuous,
 * since a draft genuinely exists in the corpus at all times.
 */

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CANARY = "draft-canary";
const generated = (name: string) =>
  readFile(join(ROOT, "content", "generated", name), "utf8");

test.describe("draft content is excluded from the build", () => {
  test("the canaries really are drafts (so these tests mean something)", async () => {
    for (const p of [
      "content/posts/2027/2027-01-01-draft-canary.md",
      "content/events/2027/draft-canary-event.md",
    ]) {
      const text = await readFile(join(ROOT, p), "utf8");
      expect(text, `${p} must keep draft: true`).toContain("draft: true");
    }
  });

  test("absent from every generated JSON artifact", async () => {
    for (const name of [
      "posts.json",
      "posts-index.json",
      "pages.json",
      "events-upcoming.json",
      "events-full.json",
    ]) {
      expect(await generated(name), `${name} leaked a draft`).not.toContain(
        CANARY,
      );
    }
  });

  test("absent from the sitemap", async () => {
    const xml = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
    expect(xml).not.toContain(CANARY);
    // Sanity: the sitemap is populated, so "not found" isn't a false pass.
    expect(xml).toContain("<url>");
  });

  test("absent from the calendar subscription feeds", async () => {
    const ics = await readFile(
      join(ROOT, "public", "calendar", "all.ics"),
      "utf8",
    );
    expect(ics).not.toContain(CANARY);
    expect(ics).not.toContain("DRAFT CANARY");
    expect(ics).toContain("BEGIN:VEVENT");
  });

  test("its URL is not served, and it is not linked from the blog", async ({
    page,
  }) => {
    await page.goto("/blog");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/DRAFT CANARY/)).toHaveCount(0);

    // No prerendered page: the SPA fallback renders its not-found state.
    await page.goto("/2027/01/01/draft-canary/");
    await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/DRAFT CANARY/)).toHaveCount(0);
  });
});
