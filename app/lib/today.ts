/**
 * What day it is — in the chapter's timezone, always.
 *
 * This site is for a Santa Clara County chapter. Its meetings are scheduled in
 * Pacific wall-clock time and its frontmatter stores Pacific wall-clock strings,
 * so "today" means today in Los Angeles — never today in UTC, and never today
 * wherever the reader happens to be sitting.
 *
 * THE BUG THIS FIXES. Several places computed the current day as
 * `new Date().toISOString().slice(0, 10)`. `toISOString()` converts to UTC, so
 * from 5pm Pacific onwards (4pm in winter) it returns TOMORROW'S date — and the
 * calendar quietly skipped a day, hiding events that were still hours away.
 * The same expression in a build meant the deployed HTML was a day ahead
 * whenever the build ran in a Pacific evening.
 *
 * `Intl` with an explicit timeZone is the only correct way to do this: it knows
 * the DST rules, so there is no offset arithmetic here to get wrong twice a
 * year. `en-CA` is used purely because its short date format is ISO-shaped.
 */

export const CHAPTER_TIMEZONE = "America/Los_Angeles";

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHAPTER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 'YYYY-MM-DD' for an instant, in the chapter's timezone. */
export function chapterDay(at: Date = new Date()): string {
  return DAY.format(at);
}

/**
 * True when a stored event time is on or after the chapter's today.
 *
 * Compares dates as strings rather than as instants: both sides are already
 * Pacific wall-clock, so string comparison is exact and cannot drift the way
 * constructing Date objects around midnight can.
 */
export function isTodayOrLater(start: string, at: Date = new Date()): boolean {
  return start.slice(0, 10) >= chapterDay(at);
}

/**
 * Shift a 'YYYY-MM-DD' by whole days.
 *
 * Pure calendar arithmetic on a date-only value (UTC midnights), so daylight
 * saving never enters into it — unlike adding 86_400_000 ms to a local Date,
 * which lands on the wrong day twice a year.
 */
export function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${p(at.getUTCMonth() + 1)}-${p(at.getUTCDate())}`;
}

/**
 * How far back the calendar keeps showing what already happened.
 *
 * Past events are deliberately NOT evicted: a meeting that happened this
 * morning is still the most useful thing on the page for someone checking what
 * they missed, and the week/month grids look broken when earlier days in the
 * current week are empty.
 */
export const CALENDAR_LOOKBACK_DAYS = 30;
