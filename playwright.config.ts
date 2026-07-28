import { defineConfig, devices } from "@playwright/test";

/** The editor SPA's dev server (see editor/vite.config.ts). */
export const EDITOR_URL = "http://localhost:9998";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:9999",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: [
    {
      command: "bun run dev",
      url: "http://localhost:9999",
      reuseExistingServer: !process.env.CI,
      // `bun run dev` assembles content (build:content) before Vite boots, so
      // allow generous startup time under load / on a large content tree.
      timeout: 180_000,
    },
    {
      // The editor SPA. Its /api/* calls are stubbed by the tests (the real
      // Worker needs GitHub credentials), so no wrangler process is required.
      command: "bun run editor:dev",
      url: EDITOR_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
