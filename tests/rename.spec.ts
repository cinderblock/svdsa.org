/**
 * Renaming, and the redirects it leaves behind.
 *
 * "Old URLs keep working" is a founding premise of this rebuild, so a rename is
 * never just a move. These tests cover the address arithmetic and the generated
 * `_redirects` file; the 301 itself was verified against `wrangler dev`.
 */

import { test, expect } from "@playwright/test";
import { InvalidNewItem, planRename } from "../editor/src/content/newItem";
import { BadRedirect, renderRedirects } from "../scripts/redirects";

test.describe("planRename", () => {
  test("a page keeps its nesting unless asked to move", () => {
    const r = planRename(
      "content/pages/political-education/bookclub/rosa-luxemburg.md",
      { slug: "rosa-luxemburg-reader" },
    );
    expect(r.path).toBe(
      "content/pages/political-education/bookclub/rosa-luxemburg-reader.md",
    );
    expect(r.url).toBe("/political-education/bookclub/rosa-luxemburg-reader/");
  });

  test("a page can be re-parented, including up to the top level", () => {
    expect(
      planRename("content/pages/a/b.md", { slug: "b", parent: "c/d" }).path,
    ).toBe("content/pages/c/d/b.md");
    // "" is a real instruction (move to top level), distinct from undefined.
    expect(
      planRename("content/pages/a/b.md", { slug: "b", parent: "" }).path,
    ).toBe("content/pages/b.md");
  });

  test("a post keeps its year bucket and date prefix", () => {
    // Only the human-chosen part of a post's address may move; the date is what
    // makes /2026/01/04/… resolvable.
    const r = planRename(
      "content/posts/2026/2026-01-04-svdsa-condemns-united-states.md",
      { slug: "on-venezuela" },
    );
    expect(r.path).toBe("content/posts/2026/2026-01-04-on-venezuela.md");
    expect(r.url).toBe("/2026/01/04/on-venezuela/");
  });

  test("a one-off event stays in its year directory; a series stays top-level", () => {
    expect(
      planRename("content/events/2026/2026-05-01-may-day.md", {
        slug: "2026-05-01-may-day-march",
      }).path,
    ).toBe("content/events/2026/2026-05-01-may-day-march.md");
    expect(
      planRename("content/events/housing-wg.md", { slug: "housing-wg-meeting" })
        .path,
    ).toBe("content/events/housing-wg-meeting.md");
  });

  test("refuses a no-op, an empty address, or an unknown shape", () => {
    expect(() => planRename("content/pages/a.md", { slug: "a" })).toThrow(
      /already its address/,
    );
    expect(() => planRename("content/pages/a.md", { slug: "  " })).toThrow(
      InvalidNewItem,
    );
    expect(() =>
      planRename("content/config/socials.yaml", { slug: "x" }),
    ).toThrow(/don't know how to rename/);
  });

  test("cannot escape the content tree", () => {
    const r = planRename("content/pages/a.md", { slug: "../../../evil" });
    expect(r.path).toBe("content/pages/evil.md");
    expect(r.path).not.toContain("..");
  });
});

/**
 * The generated `_redirects`.
 *
 * Deliberately a pure test of the generator rather than one that rewrites
 * content/config/redirects.yaml and reruns the build: mutating the working tree
 * mid-suite would disturb every other spec sharing the dev server, and half of
 * these cases are meant to FAIL the build, which would leave the generated
 * config in a broken state for whoever was mid-test.
 */
test.describe("renderRedirects", () => {
  test("emits a 301 line per rule, with the note as a comment", () => {
    const out = renderRedirects([
      { from: "/old-housing/", to: "/housing/", why: "renamed 2026-08" },
    ]);
    expect(out).toContain("# renamed 2026-08");
    expect(out).toContain("/old-housing/ /housing/ 301");
  });

  test("refuses a relative path", () => {
    // A rule that doesn't start with / silently never matches — worse than a
    // failed build, because it looks like it worked.
    expect(() => renderRedirects([{ from: "old/", to: "/new/" }])).toThrow(
      /site-absolute/,
    );
    expect(() => renderRedirects([{ from: "/old/", to: "new/" }])).toThrow(
      BadRedirect,
    );
  });

  test("refuses a self-redirect", () => {
    expect(() => renderRedirects([{ from: "/x/", to: "/x/" }])).toThrow(
      /redirects to itself/,
    );
  });

  test("refuses the same source twice", () => {
    expect(() =>
      renderRedirects([
        { from: "/x/", to: "/a/" },
        { from: "/x/", to: "/b/" },
      ]),
    ).toThrow(/more than once/);
  });

  test("refuses a chain, naming the fix", () => {
    // /a/ -> /b/ -> /c/ costs readers two hops and can loop.
    expect(() =>
      renderRedirects([
        { from: "/a/", to: "/b/" },
        { from: "/b/", to: "/c/" },
      ]),
    ).toThrow(/point it at the final address/);
  });

  test("catches a chain written in the other order", () => {
    expect(() =>
      renderRedirects([
        { from: "/b/", to: "/c/" },
        { from: "/a/", to: "/b/" },
      ]),
    ).toThrow(/point it at the final address/);
  });

  test("is empty when there are no rules", () => {
    expect(renderRedirects([])).toBe("");
  });
});
