/**
 * The published .ics feeds must agree with the site.
 *
 * Both are derived from the same stored recurrence rules, but through different
 * code paths (our engine for the site; the calendar client's own RRULE
 * implementation for subscribers). This expands every series with **ICAL.js**
 * — Mozilla's implementation, as used by Thunderbird, which honours RRULE,
 * EXDATE and RDATE — and requires the dates to match our engine exactly.
 *
 * If these ever diverge, a member's subscribed calendar silently disagrees with
 * the website, which is the worst possible failure for a meeting calendar.
 */

import { test, expect } from "@playwright/test";
import ICAL from "ical.js";
import { readFileSync, readdirSync } from "node:fs";
import { occurrences } from "../app/lib/recurrence";

const FEED_DIR = "public/calendar";
const series = JSON.parse(
  readFileSync("content/generated/events-series.json", "utf8"),
) as {
  id: string;
  slug: string;
  start: string;
  recurrence: { rrule: string; exdate?: string[]; rdate?: string[] };
}[];

function veventsOf(file: string) {
  const comp = new ICAL.Component(ICAL.parse(readFileSync(file, "utf8")));
  return comp.getAllSubcomponents("vevent");
}

/** Expand a VEVENT the way a calendar client would, as YYYY-MM-DD strings. */
function clientOccurrences(vevent: ICAL.Component, from: string, to: string) {
  const it = new ICAL.Event(vevent).iterator();
  const out: string[] = [];
  for (let n = it.next(), guard = 0; n && guard < 500; n = it.next(), guard++) {
    const ymd = `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
    if (ymd > to) break;
    if (ymd >= from) out.push(ymd);
  }
  return out.sort();
}

test("every series' feed occurrences match the site's own expansion", () => {
  const vevents = veventsOf(`${FEED_DIR}/all.ics`);
  expect(series.length).toBeGreaterThan(10);
  const from = "2026-08-01";
  const to = "2027-06-30";

  for (const s of series) {
    const vevent = vevents.find(
      (c) => c.getFirstPropertyValue("uid") === `${s.id}@siliconvalleydsa.org`,
    );
    expect(vevent, `no VEVENT for series ${s.slug}`).toBeTruthy();
    expect(
      clientOccurrences(vevent!, from, to),
      `feed disagrees with the site for ${s.slug}`,
    ).toEqual(occurrences(s.recurrence, s.start, from, to));
  }
});

test("series with hand-adjusted schedules keep their exceptions", () => {
  const vevents = veventsOf(`${FEED_DIR}/all.ics`);
  const withExceptions = series.filter(
    (s) => s.recurrence.exdate?.length || s.recurrence.rdate?.length,
  );
  // The five WGs that reschedule around holidays.
  expect(withExceptions.length).toBeGreaterThan(0);

  for (const s of withExceptions) {
    const vevent = vevents.find(
      (c) => c.getFirstPropertyValue("uid") === `${s.id}@siliconvalleydsa.org`,
    )!;
    const exdates = vevent.getAllProperties("exdate").length;
    const rdates = vevent.getAllProperties("rdate").length;

    // Every EXDATE survives: an exclusion the feed drops would put a cancelled
    // meeting back on a subscriber's calendar.
    expect(exdates, `${s.slug} exdates`).toBe(s.recurrence.exdate?.length ?? 0);

    /**
     * RDATEs are NOT one-for-one. The feed omits any the RRULE already
     * generates, because RFC 5545 makes the recurrence set a union but
     * consumers don't agree — ICAL.js and real calendar apps emit such a date
     * twice, showing the subscriber a duplicated meeting.
     *
     * So the invariant is "the extras, and only the extras". This became load
     * bearing when three series had their rules broadened to 2nd-and-4th
     * weekday while their old rdate compensations stayed behind.
     */
    const extras = (s.recurrence.rdate ?? []).filter(
      (d) =>
        !occurrences(
          { rrule: s.recurrence.rrule, exdate: s.recurrence.exdate },
          s.start,
          d,
          d,
        ).length,
    );
    expect(rdates, `${s.slug} rdates beyond the rule`).toBe(extras.length);
  }
});

test("all feeds parse and none are empty", () => {
  const files = [
    ...readdirSync(FEED_DIR)
      .filter((f) => f.endsWith(".ics"))
      .map((f) => `${FEED_DIR}/${f}`),
    ...readdirSync(`${FEED_DIR}/category`).map(
      (f) => `${FEED_DIR}/category/${f}`,
    ),
  ];
  expect(files.length).toBeGreaterThan(20);
  for (const f of files)
    expect(veventsOf(f).length, `${f} is empty`).toBeGreaterThan(0);
});
