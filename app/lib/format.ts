/**
 * Rendering stored dates and times.
 *
 * Event and post date strings are "YYYY-MM-DD HH:MM:SS" in the CHAPTER's
 * wall-clock — Pacific, with no offset and no zone in the string itself. That
 * matters, because `new Date("2026-08-19 18:30:00")` interprets it in whatever
 * zone the browser is in: this file used to do exactly that, so a member
 * reading from New York saw a 6:30pm Pacific meeting as 6:30pm Eastern. Three
 * hours wrong, and nothing on the page admitted it.
 *
 * So every function here takes an explicit `tz` and defaults to the chapter's.
 * The stored string is resolved to a real instant AS PACIFIC first, then
 * formatted in whatever zone the reader has chosen (see app/lib/timezone.tsx).
 * `Intl` does the offset lookups, so DST is never our arithmetic.
 */

import { CHAPTER_TIMEZONE } from "./today";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Cache formatters: constructing Intl formatters is the expensive part, and
 *  a calendar grid asks for hundreds of times with the same handful of zones. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(
  tz: string,
  opts: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = tz + "|" + JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    formatters.set(key, f);
  }
  return f;
}

const OFFSET_PARTS: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/** How far `tz` is from UTC at a given instant, in milliseconds. */
function offsetAt(at: Date, tz: string): number {
  const p = Object.fromEntries(
    fmt(tz, OFFSET_PARTS)
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    // en-US hour12:false renders midnight as "24" in some engines.
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - at.getTime();
}

/**
 * Resolve a chapter wall-clock string to the instant it actually names.
 *
 * Two passes: read the string as if it were UTC to get within a day of the
 * right moment, look up the zone's offset THERE, then correct. One pass would
 * use the wrong side of a DST boundary for times within an hour of the change.
 *
 * Exported for tests; components should use the formatters below.
 */
export function instantOf(s: string, tz: string = CHAPTER_TIMEZONE): Date {
  const naive = Date.parse(s.replace(" ", "T") + "Z");
  if (Number.isNaN(naive)) return new Date(NaN);
  const guess = new Date(naive - offsetAt(new Date(naive), tz));
  return new Date(naive - offsetAt(guess, tz));
}

export function longDate(s: string, tz: string = CHAPTER_TIMEZONE): string {
  return fmt(tz, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(instantOf(s));
}

export function shortDate(s: string, tz: string = CHAPTER_TIMEZONE): string {
  const p = Object.fromEntries(
    fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(instantOf(s))
      .map((x) => [x.type, x.value]),
  );
  return `${MONTHS[Number(p.month) - 1]} ${Number(p.day)}, ${p.year}`;
}

export function time(s: string, tz: string = CHAPTER_TIMEZONE): string {
  return fmt(tz, { hour: "numeric", minute: "2-digit" })
    .format(instantOf(s))
    .toLowerCase()
    .replace(" ", "");
}

/**
 * The short zone name to print beside a time — "PDT", "EST", "GMT+5:30".
 *
 * Takes an instant because it is season-dependent: the same zone is PST in
 * January and PDT in July, and showing the wrong one is exactly the kind of
 * quiet lie this whole module exists to stop.
 */
export function zoneAbbr(s: string, tz: string = CHAPTER_TIMEZONE): string {
  const part = fmt(tz, { timeZoneName: "short" })
    .formatToParts(instantOf(s))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** 'YYYY-MM-DD' for an instant in a given zone. */
function dayIn(at: Date, tz: string): string {
  const p = Object.fromEntries(
    fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * How many calendar days a reader's zone moves an event from the chapter's.
 *
 * The calendar groups by CHAPTER day — that's what the date headings and the
 * grid cells mean, and what "today" is measured in. So a 9:30pm Pacific meeting
 * shown to someone in New York reads "12:30am" under yesterday's heading, which
 * is a lie by omission unless the list says so. Returns +1 there, -1 for zones
 * behind, 0 for everyone else (which is almost always).
 */
export function dayShift(s: string, tz: string = CHAPTER_TIMEZONE): number {
  if (tz === CHAPTER_TIMEZONE) return 0;
  const at = instantOf(s);
  const mine = dayIn(at, tz);
  const theirs = dayIn(at, CHAPTER_TIMEZONE);
  if (mine === theirs) return 0;
  return Math.round(
    (Date.parse(mine + "T00:00:00Z") - Date.parse(theirs + "T00:00:00Z")) /
      86_400_000,
  );
}

/** Month + day parts for the calendar date chip. */
export function dateParts(
  s: string,
  tz: string = CHAPTER_TIMEZONE,
): { month: string; day: number } {
  const p = Object.fromEntries(
    fmt(tz, { month: "2-digit", day: "2-digit" })
      .formatToParts(instantOf(s))
      .map((x) => [x.type, x.value]),
  );
  return { month: MONTHS[Number(p.month) - 1], day: Number(p.day) };
}

export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** True if the event's start is today or later, relative to `now`. */
export function isUpcoming(start: string, now: Date): boolean {
  return instantOf(start).getTime() >= startOfDay(now).getTime();
}

/**
 * Parts of a 'YYYY-MM-DD' day key, for agenda date headings.
 *
 * Deliberately NOT zone-converted: a day key is a calendar day, not an instant,
 * and the heading has to keep matching the events grouped under it. Noon avoids
 * any chance of the parse landing on the adjacent day.
 */
export const weekdayOf = (day: string) =>
  fmt("UTC", { weekday: "short" }).format(new Date(`${day}T12:00:00Z`));
export const monthOf = (day: string) =>
  fmt("UTC", { month: "short" }).format(new Date(`${day}T12:00:00Z`));
export const dayNumber = (day: string) => Number(day.slice(8, 10));
