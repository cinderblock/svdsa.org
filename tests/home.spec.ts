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
