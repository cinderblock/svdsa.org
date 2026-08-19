import { test, expect, type Page } from "@playwright/test";
import { chapterDay } from "../app/lib/today";

/**
 * Barrier for "the calendar has hydrated".
 *
 * Subscribe is server-rendered as a plain .ics link and upgraded to webcal://
 * on mount, so its href flipping is the cheapest observable proof that React
 * has taken over. A click dispatched before that lands on markup the hydration
 * is about to replace and is silently dropped — the navigation never happens.
 */
const calendarHydrated = (page: Page) =>
  expect(page.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
    "href",
    /^webcal:/,
    { timeout: 15_000 },
  );

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has chapter title", async ({ page }) => {
    await expect(page).toHaveTitle(/Silicon Valley DSA/);
  });

  test("displays hero heading", async ({ page }) => {
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("working-class power");
  });

  test("shows upcoming events section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Upcoming events" }),
    ).toBeVisible();
  });

  test("has primary nav to the calendar", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: "Calendar" }).first(),
    ).toBeVisible();
  });
});

test.describe("Content routes", () => {
  test("renders a migrated WordPress page", async ({ page }) => {
    await page.goto("/about/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".prose")).toContainText("Democratic Socialists");
  });

  test("calendar lists events and can filter", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
    await expect(page.locator(".ecard").first()).toBeVisible();
  });

  test("calendar row links to an event detail page", async ({ page }) => {
    // React Router holds the URL back until the event route's module and loader
    // resolve, and this is the first test to reach /event/$slug, so it pays the
    // dev server's cold compile for that route — tens of seconds when the whole
    // suite is compiling in parallel. Every later /event/ test finds it warm.
    test.slow();
    await page.goto("/calendar");
    await calendarHydrated(page);
    await page.locator("a.ecard").first().click();
    await expect(page).toHaveURL(/\/event\//, { timeout: 30_000 });
    // "Back to calendar" also appears on the route's not-found branch, so
    // "When" is what actually proves the event resolved.
    await expect(page.getByRole("heading", { name: "When" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("link", { name: "Back to calendar" }),
    ).toBeVisible();
  });

  test("the calendar does not decay: recurring meetings survive a stale build", async ({
    page,
  }) => {
    // Fake only Date (not timers, so React still flushes) to far beyond any
    // prerendered occurrence. One-off events are all in the past and drop off,
    // but recurring series are derived from their rules in the browser — so the
    // calendar must still list meetings. This is the property that makes the
    // scheduled rebuild an optimization rather than a correctness requirement.
    await page.clock.setFixedTime(new Date("2099-01-01T12:00:00"));
    await page.goto("/calendar");

    // Wait for hydration before reading hrefs: the prerendered snapshot holds
    // the BUILD's occurrences, and evaluateAll (unlike a Playwright assertion)
    // does not retry, so reading early samples the pre-hydration DOM.
    await calendarHydrated(page);

    await expect(page.getByText(/^0 upcoming events/)).toHaveCount(0);
    const rows = page.locator("a.ecard");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(10);
    // Dates shown must be near the mocked clock, not the build's window. NOT
    // `rows.first()`: the calendar deliberately keeps a lookback window, so the
    // first card is the most recent PAST occurrence (late 2098 here). What
    // matters is that the rules are being expanded around now, not that the
    // list starts in the future.
    const hrefs = await rows.evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? ""),
    );
    // Dated occurrence URLs must sit around the mocked clock, proving the rules
    // were expanded against it rather than served from the build's window. The
    // lookback means the earliest are in late 2098, so accept either year.
    const dated = hrefs.filter((h) => /\/\d{4}-\d{2}-\d{2}\//.test(h));
    expect(dated.length).toBeGreaterThan(0);
    expect(dated.every((h) => /\/(2098|2099)-/.test(h))).toBe(true);
  });

  test("join page embeds the dues + newsletter forms", async ({ page }) => {
    // domcontentloaded, not load: don't wait on the external form iframes to
    // finish loading (slow/unreliable); their elements are in the DOM already.
    await page.goto("/join/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Join the movement" }),
    ).toBeVisible();
    // Assert the embeds are wired (present in the DOM) without waiting on the
    // external services to render — keeps the test fast and network-independent.
    await expect(page.locator('iframe[src*="zeffy.com"]')).toHaveCount(1);
    await expect(page.locator('iframe[src*="actionnetwork.org"]')).toHaveCount(
      1,
    );
  });

  test("unknown path shows 404", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page not found",
    );
  });
});

test.describe("Recurring events", () => {
  test("a series page shows the pattern and its upcoming dates", async ({
    page,
  }) => {
    await page.goto("/event/sjfreestore/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Free Store",
    );
    await expect(page.getByText("3rd Saturday monthly")).toBeVisible();
    const dates = page.locator(".occurrences li a");
    await expect(dates.first()).toBeVisible();
    expect(await dates.count()).toBeGreaterThan(2);
    // Each listed date links to that occurrence.
    await expect(dates.first()).toHaveAttribute(
      "href",
      /\/event\/sjfreestore\/\d{4}-\d{2}-\d{2}\/$/,
    );
  });

  test("an occurrence far beyond the prerendered window still renders", async ({
    page,
  }) => {
    // 3rd Saturday of Nov 2027 — well past the 90-day prerender horizon, so
    // this URL has no static page and must resolve from the rule client-side.
    await page.goto("/event/sjfreestore/2027-11-20/");
    // No static page, so the route renders only after hydration — wait for it
    // rather than asserting against a bare app shell (see the sibling below).
    await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Free Store",
    );
    await expect(page.getByRole("heading", { name: "When" })).toBeVisible();
    await expect(page.getByText("November")).toBeVisible();
  });

  test("a date the series does not meet on is not invented", async ({
    page,
  }) => {
    // A Tuesday — the Free Store is a 3rd-Saturday series.
    await page.goto("/event/sjfreestore/2027-11-16/");
    // This URL is past the prerender horizon, so there is no static page: the
    // whole route resolves from the rule after hydration. Wait for the route
    // to actually render before asserting — in dev the client bundle can take
    // longer than the default 5 s timeout under parallel load, and asserting
    // early just sees the app shell with no <h1> yet.
    await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This event isn't on the calendar",
    );
  });
});

test.describe("Calendar subscription feeds", () => {
  test("the all-events feed is valid iCalendar with recurring series", async ({
    request,
  }) => {
    const res = await request.get("/calendar/all.ics");
    expect(res.status()).toBe(200);
    const body = await res.text();

    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    // CRLF line endings are mandatory (RFC 5545 §3.1).
    expect(body.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(
      true,
    );
    // Wall-clock times must carry the timezone, and it must be defined.
    expect(body).toContain("BEGIN:VTIMEZONE");
    expect(body).toContain("TZID:America/Los_Angeles");
    expect(body).toContain("DTSTART;TZID=America/Los_Angeles:");
    // Recurring meetings ship as RRULEs, not as hundreds of copies.
    const events = body.match(/BEGIN:VEVENT/g)?.length ?? 0;
    const rrules = body.match(/^RRULE:FREQ=(WEEKLY|MONTHLY)/gm)?.length ?? 0;
    expect(events).toBeGreaterThan(20);
    expect(rrules).toBeGreaterThan(10);
    // No line may exceed 75 octets (folding).
    for (const line of body.split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });

  test("filtered feeds are served and are subsets of the full feed", async ({
    request,
  }) => {
    const count = async (path: string) => {
      const res = await request.get(path);
      expect(res.status(), `${path} should exist`).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/calendar");
      return (await res.text()).match(/BEGIN:VEVENT/g)?.length ?? 0;
    };
    const all = await count("/calendar/all.ics");
    const wg = await count("/calendar/working-groups.ics");
    const cat = await count("/calendar/category/committee-tech-and-data.ics");

    expect(wg).toBeGreaterThan(0);
    expect(wg).toBeLessThan(all);
    expect(cat).toBeGreaterThan(0);
    expect(cat).toBeLessThanOrEqual(all);
  });

  test("calendar page offers subscribe links for the active filter", async ({
    page,
  }) => {
    await page.goto("/calendar");
    // Subscribe is server-rendered as a plain .ics link and upgraded to
    // webcal:// after hydration — assert the target feed either way, so this
    // doesn't race hydration.
    await expect(page.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      /(^|\/)calendar\/all\.ics$/,
    );
    await expect(
      page.getByRole("link", { name: "Download .ics" }),
    ).toHaveAttribute("href", "/calendar/all.ics");

    // Wait for hydration before interacting: the webcal:// upgrade only
    // happens after mount, so it doubles as the hydration barrier (a click
    // dispatched earlier would be dropped and the filter wouldn't change).
    await expect(page.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      /^webcal:\/\/.+\/calendar\/all\.ics$/,
      { timeout: 15_000 },
    );

    // Switching the filter switches the feed.
    await page.getByRole("button", { name: "Working Groups" }).click();
    await expect(
      page.getByRole("link", { name: "Download .ics" }),
    ).toHaveAttribute("href", "/calendar/working-groups.ics");
    await expect(page.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      /(^|\/)calendar\/working-groups\.ics$/,
    );
  });

  test("event page links to a single-event .ics that exists", async ({
    page,
    request,
  }) => {
    // Navigates an event page and then fetches a generated .ics, so it wears
    // both the route's and the feed's first-hit compile under a loaded suite.
    test.slow();
    await page.goto("/calendar");
    await calendarHydrated(page);
    await page.locator("a.ecard").first().click();
    const link = page.getByRole("link", { name: "Add to calendar" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/calendar\/event\/.+\.ics$/);
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.match(/BEGIN:VEVENT/g)?.length).toBe(1);
  });
});

test.describe("Calendar scrollback", () => {
  /**
   * The calendar keeps a month of history so a member can scroll back to what
   * they missed — but the page's job is "what's on next", so it must still OPEN
   * on the current week. Those pull against each other, and the split is: the
   * prerendered grid starts at today, and only a hydrated page extends
   * backwards, scroll-anchoring today so the reader isn't shoved down the page.
   *
   * These assert structure, not pixels. The dev server injects CSS through the
   * JS bundle, so a JS-disabled page here is unstyled and every coordinate read
   * off it is meaningless; comparing offsets between the two renders only works
   * against a built site.
   */
  const firstWeekHoldsToday = (page: Page) =>
    page.evaluate(
      () => !!document.querySelector(".cal-week")?.querySelector(".is-today"),
    );

  test("without JS the week grid starts on the current week", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto("/calendar?view=week", { waitUntil: "domcontentloaded" });
    const days = (
      await p
        .locator("a.cal-chip")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))
    )
      .map((h) => h.match(/\/(\d{4}-\d{2}-\d{2})\//)?.[1])
      .filter((d): d is string => !!d);
    const startsOnToday = await firstWeekHoldsToday(p);
    await ctx.close();

    expect(days.length).toBeGreaterThan(0);
    // Against the CHAPTER's day, not the runner's: on a UTC machine in a
    // Pacific evening those differ, and that difference was the original bug.
    expect(days.every((d) => d >= chapterDay())).toBe(true);
    expect(startsOnToday).toBe(true);
  });

  test("hydration prepends the past and scrolls to hold today in place", async ({
    page,
  }) => {
    await page.goto("/calendar?view=week");
    await calendarHydrated(page);

    // Weeks really were inserted above today...
    await expect
      .poll(() => firstWeekHoldsToday(page), { timeout: 10_000 })
      .toBe(false);
    // ...and the page scrolled to compensate, rather than leaving the reader
    // parked a month in the past. Without the anchor this is 0.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("a past event the calendar shows still has a page", async ({ page }) => {
    // The lookback is only worth having if its cards go somewhere: past
    // one-offs must survive into events-full.json, and be prerendered.
    await page.goto("/calendar?view=week");
    await calendarHydrated(page);
    const href = await page.locator("a.cal-chip").first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.getByRole("heading", { name: "When" })).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Calendar views", () => {
  test("week view stacks weeks vertically with all seven days", async ({
    page,
  }) => {
    await page.goto("/calendar?view=week");
    await expect(page.getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const weeks = page.locator(".cal-week");
    expect(await weeks.count()).toBeGreaterThan(4); // scrolls, doesn't page
    // Every week block shows all 7 days, empty ones included.
    await expect(weeks.first().locator(".cal-day")).toHaveCount(7);
    // Today is marked, exactly once across the whole view.
    await expect(page.locator(".cal-day.is-today")).toHaveCount(1);
  });

  test("month view is a 7-column grid per month, stacked", async ({ page }) => {
    await page.goto("/calendar?view=month");
    const months = page.locator("table.cal-month");
    expect(await months.count()).toBeGreaterThan(2);
    // Real table semantics: weekday column headers.
    await expect(months.first().locator("thead th")).toHaveCount(7);
    await expect(months.first().locator("thead th").first()).toContainText(
      "Sun",
    );
    // Today is highlighted once — padding cells of the next month must not
    // also light up (regression: is-today leaked into out-of-month cells).
    await expect(page.locator("td.is-today")).toHaveCount(1);
    // Out-of-month padding cells never carry events.
    await expect(page.locator("td.is-outside .cal-chip")).toHaveCount(0);
  });

  test("the view is shareable via the URL and filters still apply", async ({
    page,
  }) => {
    await page.goto("/calendar?view=month");
    await expect(page.locator("table.cal-month").first()).toBeVisible();
    await calendarHydrated(page);

    // Switching view updates the URL; switching back to List clears it.
    await page.getByRole("button", { name: "Week" }).click();
    await expect(page).toHaveURL(/\?view=week/);
    await page.getByRole("button", { name: "List" }).click();
    await expect(page).not.toHaveURL(/view=/);

    // A facet filter narrows the calendar views too.
    await page.goto("/calendar?view=week");
    await calendarHydrated(page);
    const before = await page.locator(".cal-chip").count();
    await page.getByRole("button", { name: "Committees" }).click();
    const after = await page.locator(".cal-chip").count();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });
});
