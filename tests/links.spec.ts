/**
 * Internal link checking (editor/src/content/links.ts).
 *
 * Dead internal links are how a chapter site rots. This is the deterministic
 * half — no network, so it can run on every save without being slow or
 * intermittently wrong.
 *
 * The corpus taught this checker its most important lesson: it has only ~15
 * genuinely relative internal links, because the WordPress migration wrote them
 * as absolute URLs to the live domain. A checker that treated those as
 * "external" would have reported a clean bill of health while 91 links were
 * broken.
 */

import { test, expect } from "@playwright/test";
import {
  checkLinks,
  extractLinks,
  knownUrls,
  SELF_HOSTS,
} from "../editor/src/content/links";

/** A small stand-in corpus covering each path convention. */
const PATHS = [
  "content/pages/about.md",
  "content/pages/political-education/bookclub/rosa-luxemburg.md",
  "content/posts/2026/2026-01-04-on-venezuela.md",
  "content/events/2026/2026-05-01-may-day.md",
  "content/events/sjfreestore.md",
];

test.describe("knownUrls", () => {
  test("derives addresses from filenames alone", () => {
    const { urls, eventSlugs } = knownUrls(PATHS);
    expect(urls).toContain("/about/");
    expect(urls).toContain("/political-education/bookclub/rosa-luxemburg/");
    expect(urls).toContain("/2026/01/04/on-venezuela/");
    expect(urls).toContain("/event/2026-05-01-may-day/");
    expect(urls).toContain("/event/sjfreestore/");
    // Static routes the app serves without a content file.
    expect(urls).toContain("/calendar");
    expect(eventSlugs).toContain("sjfreestore");
  });
});

test.describe("extractLinks", () => {
  test("finds Markdown and raw-HTML links, ignoring code fences", () => {
    const md = [
      "A [page](/about/) and <a href='/calendar'>cal</a>.",
      "",
      "```",
      "[not a link](/ignored/)",
      "```",
      "",
      'Also <img src="/x.png"> and [this](/join/).',
    ].join("\n");
    const found = extractLinks(md);
    // Markdown destinations are scanned before HTML attributes within a line,
    // so /join/ precedes the <img> that appears earlier in the source.
    expect(found.map((l) => l.url)).toEqual([
      "/about/",
      "/calendar",
      "/join/",
      "/x.png",
    ]);
    // The image is marked an asset, so it is never reported as a dead link:
    // files in public/ are real addresses no content path predicts.
    expect(found.find((l) => l.url === "/x.png")?.asset).toBe(true);
    expect(checkLinks('<img src="/x.png">', PATHS)).toEqual([]);
  });

  test("unwraps absolute links to our own domain, skips real externals", () => {
    const md =
      `[a](https://siliconvalleydsa.org/labor/) ` +
      `[b](https://www.siliconvalleydsa.org/donate/) ` +
      `[c](https://actionnetwork.org/forms/x) ` +
      `[d](//evil.example/x) [e](mailto:a@b.c) [f](#section)`;
    const found = extractLinks(md);
    expect(found.map((l) => l.url)).toEqual(["/labor/", "/donate/"]);
    expect(found.every((l) => l.absolute)).toBe(true);
  });

  test("reports position, so the editor can point at the line", () => {
    const found = extractLinks("ok\n\nsee [x](/nope/)");
    expect(found[0].line).toBe(3);
    expect(found[0].column).toBeGreaterThan(1);
  });
});

test.describe("checkLinks", () => {
  test("passes links that resolve, in either slash spelling", () => {
    expect(
      checkLinks("[a](/about/) [b](/about) [c](/calendar)", PATHS),
    ).toEqual([]);
  });

  test("accepts a dated occurrence of a real series", () => {
    // Which dates a rule generates isn't knowable from filenames, so a dated
    // occurrence is accepted by shape when the series exists...
    expect(checkLinks("[x](/event/sjfreestore/2027-11-20/)", PATHS)).toEqual(
      [],
    );
    // ...but not for a series that doesn't.
    expect(checkLinks("[x](/event/ghost/2027-11-20/)", PATHS)).toHaveLength(1);
  });

  test("reports a dead link once, however many times it appears", () => {
    const f = checkLinks("[a](/gone/) [b](/gone/) [c](/gone/)", PATHS);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe("dead-internal-link");
    expect(f[0].match).toBe("/gone/");
  });

  test("flags a WordPress asset separately — it dies with WordPress", () => {
    const f = checkLinks(
      '<img src="https://siliconvalleydsa.org/wp-content/uploads/2024/x.png">',
      PATHS,
    );
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe("wordpress-asset");
    expect(f[0].message).toMatch(/retired/);
  });

  test("flags a working absolute self-link, suggesting the relative path", () => {
    // It resolves, so it isn't dead — but it leaves any preview deployment and
    // forces a full page load.
    const f = checkLinks("[a](https://siliconvalleydsa.org/about/)", PATHS);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe("absolute-internal-link");
    expect(f[0].suggest).toBe("/about/");
  });

  test("ignores query strings and fragments when resolving", () => {
    expect(checkLinks("[a](/about/?x=1) [b](/about/#top)", PATHS)).toEqual([]);
  });

  test("accepts the generated calendar feeds", () => {
    expect(
      checkLinks(
        "[all](/calendar/all.ics) [wg](/calendar/category/x.ics)",
        PATHS,
      ),
    ).toEqual([]);
  });

  test("everything is a warning — a draft may link to a page it adds", () => {
    // Blocking a save on this would teach editors to distrust the check.
    const f = checkLinks("[a](/gone/) [b](/wp-content/x.png)", PATHS);
    expect(f.map((x) => x.level)).toEqual(
      ["wordpress-asset", "dead-internal-link"].map(() => "warn"),
    );
  });

  test("knows which hosts are us", () => {
    expect(SELF_HOSTS).toContain("siliconvalleydsa.org");
    expect(SELF_HOSTS).toContain("www.siliconvalleydsa.org");
  });
});
