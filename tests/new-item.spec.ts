/**
 * Where new content lands (editor/src/content/newItem.ts).
 *
 * Every convention asserted here was read off the existing corpus, so these
 * tests are really "does a wizard-created item look like the 1000 files already
 * in the repo". Getting a path wrong is expensive: the URL is the one thing an
 * editor cannot fix afterwards without a redirect.
 */

import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  idForPath,
  InvalidNewItem,
  planNewItem,
} from "../editor/src/content/newItem";

test.describe("planNewItem", () => {
  test("a post is year-bucketed with the date in the filename", () => {
    const p = planNewItem({
      kind: "post",
      title: "SVDSA Condemns the Raids",
      date: "2027-03-04",
    });
    expect(p.path).toBe(
      "content/posts/2027/2027-03-04-svdsa-condemns-the-raids.md",
    );
    expect(p.url).toBe("/2027/03/04/svdsa-condemns-the-raids/");
    expect(p.frontmatter.date).toBe("2027-03-04T09:00:00");
  });

  test("a one-off event carries its date INSIDE the slug", () => {
    // 538 migrated one-offs do this; it keeps an annual event from colliding
    // with itself next year.
    const p = planNewItem({
      kind: "event",
      title: "May Day March",
      date: "2027-05-01",
      startTime: "11:00",
      endTime: "14:00",
      venue: "Plaza de César Chávez",
    });
    expect(p.path).toBe("content/events/2027/2027-05-01-may-day-march.md");
    expect(p.url).toBe("/event/2027-05-01-may-day-march/");
    expect(p.frontmatter.start).toBe("2027-05-01 11:00:00");
    expect(p.frontmatter.end).toBe("2027-05-01 14:00:00");
    expect(p.frontmatter.venue).toEqual({ name: "Plaza de César Chávez" });
    expect(p.frontmatter.recurrence).toBeUndefined();
  });

  test("a series lives at the top level, dateless, with a rule", () => {
    // 2027-03-06 is a Saturday.
    const p = planNewItem({
      kind: "series",
      title: "Housing WG Meeting",
      date: "2027-03-06",
    });
    expect(p.path).toBe("content/events/housing-wg-meeting.md");
    expect(p.url).toBe("/event/housing-wg-meeting/");
    // The slug must NOT carry the date: the series outlives any single date.
    expect(p.frontmatter.slug).toBe("housing-wg-meeting");
    expect(p.frontmatter.recurrence).toEqual({
      rrule: "FREQ=WEEKLY;BYDAY=SA",
    });
  });

  test("a page mirrors its URL, and can nest", () => {
    expect(planNewItem({ kind: "page", title: "Mutual Aid" }).path).toBe(
      "content/pages/mutual-aid.md",
    );
    const nested = planNewItem({
      kind: "page",
      title: "Rosa Luxemburg",
      parent: "political-education/bookclub",
    });
    expect(nested.path).toBe(
      "content/pages/political-education/bookclub/rosa-luxemburg.md",
    );
    expect(nested.url).toBe("/political-education/bookclub/rosa-luxemburg/");
  });

  test("a parent given as a URL works the same as a slug path", () => {
    const a = planNewItem({ kind: "page", title: "X", parent: "/about/" });
    const b = planNewItem({ kind: "page", title: "X", parent: "about" });
    expect(a.path).toBe(b.path);
    expect(a.path).toBe("content/pages/about/x.md");
  });

  test("draft only appears when asked for", () => {
    expect(
      planNewItem({ kind: "page", title: "X", draft: true }).frontmatter.draft,
    ).toBe(true);
    expect(
      planNewItem({ kind: "page", title: "X" }).frontmatter,
    ).not.toHaveProperty("draft");
  });

  test("refuses input it cannot turn into a path", () => {
    expect(() => planNewItem({ kind: "page", title: "  " })).toThrow(
      InvalidNewItem,
    );
    // A title of only punctuation slugs to nothing.
    expect(() => planNewItem({ kind: "page", title: "!!! ???" })).toThrow(
      /add a slug/,
    );
    expect(() => planNewItem({ kind: "post", title: "X" })).toThrow(/date/);
    expect(() =>
      planNewItem({ kind: "post", title: "X", date: "March 4th" }),
    ).toThrow(/YYYY-MM-DD/);
  });

  test("a title that escapes its directory cannot", () => {
    // slugify strips separators, so traversal can't survive it — assert rather
    // than assume, since this is the wizard's half of the write boundary.
    const p = planNewItem({ kind: "page", title: "../../../etc/passwd" });
    expect(p.path).toBe("content/pages/etc-passwd.md");
    expect(p.path).not.toContain("..");
  });
});

test.describe("idForPath", () => {
  test("is deterministic and clear of the WordPress range", () => {
    expect(idForPath("/x/")).toBe(idForPath("/x/"));
    expect(idForPath("/x/")).toBeGreaterThan(900_000_000);
  });

  test("does not collide with any id already in the corpus", async () => {
    // The real guarantee is build-content.ts's duplicate check; this catches the
    // narrower mistake of choosing an offset that overlaps migrated content.
    const existing = new Set<string>();
    for (const dir of ["pages", "posts", "events"]) {
      const root = join(import.meta.dirname, "..", "content", dir);
      const files = (
        (await readdir(root, { recursive: true })) as string[]
      ).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        const id = (await readFile(join(root, f), "utf8")).match(
          /^id:\s*(\S+)/m,
        )?.[1];
        if (id) existing.add(id);
      }
    }
    expect(existing.size).toBeGreaterThan(300);
    for (const url of ["/about/", "/2027/01/01/x/", "/event/y/"])
      expect(existing.has(String(idForPath(url)))).toBe(false);
  });
});
