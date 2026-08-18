/**
 * "Today" is always today in Los Angeles.
 *
 * The chapter is in Santa Clara County and its frontmatter stores Pacific
 * wall-clock times, so any other notion of today is wrong. Several places used
 * `new Date().toISOString().slice(0, 10)`, which is UTC — from 5pm Pacific
 * onwards (4pm in winter) that is TOMORROW, and the calendar skipped a day:
 * events still hours away vanished from the page.
 *
 * These tests pin instants rather than reading the clock, so they assert the
 * same thing at 9am and at 11pm — which is the whole point, and is why the bug
 * survived: it is invisible for two thirds of every day.
 */

import { test, expect } from "@playwright/test";
import {
  CALENDAR_LOOKBACK_DAYS,
  chapterDay,
  isTodayOrLater,
  shiftDay,
} from "../app/lib/today";

test.describe("chapterDay", () => {
  test("a Pacific evening is still today, not tomorrow", () => {
    // 18:28 PDT on Aug 17 — the exact case that was reported.
    const evening = new Date("2026-08-18T01:28:00Z");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-08-18"); // the old bug
    expect(chapterDay(evening)).toBe("2026-08-17"); // what it must be
  });

  test("works in winter too, when the offset is different", () => {
    // 19:30 PST on Dec 18. A hard-coded -7 would get this wrong.
    expect(chapterDay(new Date("2026-12-19T03:30:00Z"))).toBe("2026-12-18");
  });

  test("just after Pacific midnight is already the new day", () => {
    // 00:05 PDT on Aug 18 == 07:05 UTC.
    expect(chapterDay(new Date("2026-08-18T07:05:00Z"))).toBe("2026-08-18");
  });

  test("just before Pacific midnight is still the old day", () => {
    // 23:55 PDT on Aug 17 == 06:55 UTC on Aug 18.
    expect(chapterDay(new Date("2026-08-18T06:55:00Z"))).toBe("2026-08-17");
  });
});

test.describe("isTodayOrLater", () => {
  const evening = new Date("2026-08-18T01:28:00Z"); // 18:28 PDT Aug 17

  test("keeps an event earlier the same day", () => {
    // The 10am meeting must not disappear from an afternoon reader's calendar.
    expect(isTodayOrLater("2026-08-17 10:00:00", evening)).toBe(true);
  });

  test("keeps tonight's event", () => {
    expect(isTodayOrLater("2026-08-17 19:00:00", evening)).toBe(true);
  });

  test("drops yesterday", () => {
    expect(isTodayOrLater("2026-08-16 19:00:00", evening)).toBe(false);
  });
});

test.describe("shiftDay", () => {
  test("moves whole calendar days", () => {
    expect(shiftDay("2026-08-17", -1)).toBe("2026-08-16");
    expect(shiftDay("2026-08-17", 1)).toBe("2026-08-18");
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31");
  });

  test("is unaffected by daylight saving", () => {
    // Spanning the US fall-back (2026-11-01): ms arithmetic on a local Date
    // repeats a day here; calendar arithmetic does not.
    expect(shiftDay("2026-11-02", -1)).toBe("2026-11-01");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    // ...and the spring-forward, which skips an hour rather than repeating one.
    expect(shiftDay("2027-03-15", -1)).toBe("2027-03-14");
  });

  test("crosses a year boundary", () => {
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
  });
});

test("the calendar keeps a window of past events", () => {
  // Not a preference — evicting them is what made a morning meeting vanish by
  // lunchtime, and leaves the week grid full of empty earlier days.
  expect(CALENDAR_LOOKBACK_DAYS).toBeGreaterThan(0);
  const from = shiftDay(
    chapterDay(new Date("2026-08-18T01:28:00Z")),
    -CALENDAR_LOOKBACK_DAYS,
  );
  expect(from < "2026-08-17").toBe(true);
});
