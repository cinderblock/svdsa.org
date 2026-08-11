import { defineConfig, devices } from "@playwright/test";

/** The editor SPA's dev server (see editor/vite.config.ts). */
export const EDITOR_URL = "http://localhost:9998";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Playwright's local default is half the LOGICAL cores — 6 on this machine,
   * each driving a real browser (several OS processes) on 6 PHYSICAL cores.
   * That saturates a computer someone is trying to use, and worse, it makes the
   * results wrong: under load an ordinary wait becomes a timeout, and a timeout
   * reads exactly like a regression. Measured 2026-08-11 — 14 specs failed
   * under contention and every one passed when run alone.
   *
   * Three leaves the machine usable. Raise it deliberately with PW_WORKERS.
   */
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS ?? 3),
  /**
   * Waits for this run's share of the machine before any browser starts, so two
   * suites (or a suite and another project's build) can't saturate it. Returns
   * its own teardown. See that file.
   */
  globalSetup: "./tests/compute-budget.ts",
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
