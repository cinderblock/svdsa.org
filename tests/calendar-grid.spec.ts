/**
 * Calendar grid integrity.
 *
 * The week and month grids were built by adding 86_400_000 ms per day, which
 * is wrong twice a year: on the US fall-back day local midnight + 24 h is
 * 23:00 on the SAME date, so the grid repeated a day and dropped the next one
 * (React noticed first, as a duplicate-key warning for `2026-11-01`).
 *
 * Pinned to Pacific — the chapter's timezone, and the one whose DST
 * transitions the grid has to survive.
 */

import { test, expect } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles" });

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

test.describe("Month view", () => {
  test("every month shows each of its days exactly once", async ({ page }) => {
    await page.goto("/calendar?view=month");
    const tables = page.locator("table.cal-month");
    await expect(tables.first()).toBeVisible();

    const count = await tables.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      const table = tables.nth(i);
      const caption = (await table.locator("caption").innerText()).trim();
      const [monthName, year] = caption.split(" ");
      const month = MONTHS.indexOf(monthName);
      expect(month, `unparsed caption: ${caption}`).toBeGreaterThanOrEqual(0);

      // Day 0 of the next month is the last day of this one.
      const daysInMonth = new Date(Number(year), month + 1, 0).getDate();
      const shown = await table.locator(".cal-cell__date").allInnerTexts();
      const nums = shown.map((t) => Number(t.trim()));

      // The first rendered month may start mid-week (past weeks are trimmed),
      // so it can legitimately begin after the 1st — but it must still run to
      // the end of the month with no repeats and no gaps.
      const expected = Array.from(
        { length: daysInMonth - nums[0] + 1 },
        (_, k) => nums[0] + k,
      );
      expect(nums, `${caption} day numbers`).toEqual(expected);
    }
  });
});

test.describe("Week view", () => {
  test("consecutive weeks never repeat or skip a day", async ({ page }) => {
    await page.goto("/calendar?view=week");
    const days = page.locator(".cal-week__days .cal-day .dom");
    await expect(days.first()).toBeVisible();

    const nums = (await days.allInnerTexts()).map((t) => Number(t.trim()));
    expect(nums.length % 7, "weeks should be whole").toBe(0);

    // Walk the sequence: each day is either +1, or a rollover to the 1st from
    // a real month-end. Without the `prev >= 28` guard a DST-duplicated day
    // (…, 1, 1, 2, …) would slip through as a "rollover".
    for (let i = 1; i < nums.length; i++) {
      const prev = nums[i - 1];
      const cur = nums[i];
      expect(
        cur === prev + 1 || (cur === 1 && prev >= 28),
        `day ${cur} followed ${prev} at index ${i}`,
      ).toBe(true);
    }
  });
});
