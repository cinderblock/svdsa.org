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

  test("unknown path shows 404", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page not found",
    );
  });
});
