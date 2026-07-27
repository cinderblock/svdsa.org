import { test, expect } from "@playwright/test";

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
    await expect(page.locator(".event-row").first()).toBeVisible();
  });

  test("calendar row links to an event detail page", async ({ page }) => {
    await page.goto("/calendar");
    await page.locator("a.event-row").first().click();
    await expect(page).toHaveURL(/\/event\//);
    await expect(page.getByRole("heading", { name: "When" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to calendar" }),
    ).toBeVisible();
  });

  test("calendar filters by the client's clock (past events drop)", async ({
    page,
  }) => {
    // Fake only Date (not timers, so React still flushes) to far in the
    // future: every shipped event is now in the past, so after hydration the
    // calendar shows none.
    await page.clock.setFixedTime(new Date("2099-01-01T12:00:00"));
    await page.goto("/calendar");
    await expect(page.getByText("0 upcoming events")).toBeVisible();
    await expect(page.getByText("No events match that filter.")).toBeVisible();
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
    await page.goto("/calendar");
    await page.locator("a.event-row").first().click();
    const link = page.getByRole("link", { name: "Add to calendar" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/calendar\/event\/.+\.ics$/);
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.match(/BEGIN:VEVENT/g)?.length).toBe(1);
  });
});
