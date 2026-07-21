import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has correct title", async ({ page }) => {
    await expect(page).toHaveTitle("My Site");
  });

  test("displays heading", async ({ page }) => {
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Hello, World");
  });

  test("has proper meta description", async ({ page }) => {
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute(
      "content",
      "A static site built with React Router and Vite.",
    );
  });

  test("has Open Graph tags", async ({ page }) => {
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "My Site",
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "website",
    );
  });
});

test.describe("404 Page", () => {
  test("displays not found message", async ({ page }) => {
    await page.goto("/nonexistent-page");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("404");
  });

  test("has link back to home", async ({ page }) => {
    await page.goto("/nonexistent-page");
    const link = page.getByRole("link", { name: "Go back home" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/");
  });
});
