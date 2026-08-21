/**
 * Stored times are Pacific wall-clock. Displaying them is a conversion.
 *
 * The bug these pin: `new Date("2026-08-19 18:30:00")` is parsed in whatever
 * zone the browser happens to be in, so a 6:30pm San Jose meeting rendered as
 * 6:30pm in New York too — three hours wrong, with nothing on the page saying
 * which zone it meant. Every function in app/lib/format.ts now takes an
 * explicit zone and defaults to the chapter's.
 *
 * These run in the test runner's own zone, whatever that is, and must pass
 * there — that is the whole point. Nothing here reads the ambient clock.
 */

import { test, expect } from "@playwright/test";
import {
  dateParts,
  dayShift,
  instantOf,
  longDate,
  shortDate,
  time,
  zoneAbbr,
} from "../app/lib/format";
import { CHAPTER_TIMEZONE } from "../app/lib/today";

const EAST = "America/New_York";
const IST = "Asia/Kolkata";

test.describe("instantOf", () => {
  test("reads a stored string as Pacific, not as the local zone", () => {
    // 6:30pm PDT on Aug 19 is 01:30 UTC on Aug 20.
    expect(instantOf("2026-08-19 18:30:00").toISOString()).toBe(
      "2026-08-20T01:30:00.000Z",
    );
  });

  test("uses the right offset in winter", () => {
    // PST (-8), not PDT (-7): 6:30pm on Dec 19 is 02:30 UTC on Dec 20.
    expect(instantOf("2026-12-19 18:30:00").toISOString()).toBe(
      "2026-12-20T02:30:00.000Z",
    );
  });

  test("picks the correct side of a DST boundary", () => {
    // 2026-11-01 is the US fall-back. 00:30 is still PDT (-7); 03:00 is PST
    // (-8). A single-pass offset lookup gets one of these wrong.
    expect(instantOf("2026-11-01 00:30:00").toISOString()).toBe(
      "2026-11-01T07:30:00.000Z",
    );
    expect(instantOf("2026-11-01 03:00:00").toISOString()).toBe(
      "2026-11-01T11:00:00.000Z",
    );
    // ...and the spring-forward, where 02:30 doesn't exist at all. It must
    // still resolve to a real instant rather than NaN.
    expect(Number.isNaN(instantOf("2027-03-14 02:30:00").getTime())).toBe(
      false,
    );
  });

  test("a date-only key is that day's Pacific midnight", () => {
    expect(instantOf("2026-08-19").toISOString()).toBe(
      "2026-08-19T07:00:00.000Z",
    );
  });
});

test.describe("time", () => {
  const evening = "2026-08-19 18:30:00";

  test("defaults to the chapter's zone", () => {
    expect(time(evening)).toBe("6:30pm");
    expect(time(evening, CHAPTER_TIMEZONE)).toBe("6:30pm");
  });

  test("converts for a reader elsewhere", () => {
    expect(time(evening, EAST)).toBe("9:30pm");
    // +12:30 from Pacific in August — and a half-hour offset, which is where
    // naive hour arithmetic falls over.
    expect(time(evening, IST)).toBe("7:00am");
  });

  test("a late meeting lands on the next day back east", () => {
    // 9:30pm Pacific is half past midnight in New York, the following date.
    const late = "2026-08-19 21:30:00";
    expect(time(late, EAST)).toBe("12:30am");
    expect(longDate(late, EAST)).toContain("August 20");
    expect(longDate(late)).toContain("August 19");
  });
});

test.describe("zoneAbbr", () => {
  test("is seasonal, not fixed", () => {
    expect(zoneAbbr("2026-08-19 18:30:00")).toBe("PDT");
    expect(zoneAbbr("2026-12-19 18:30:00")).toBe("PST");
  });

  test("names the reader's zone when they've chosen one", () => {
    expect(zoneAbbr("2026-08-19 18:30:00", EAST)).toBe("EDT");
    expect(zoneAbbr("2026-12-19 18:30:00", EAST)).toBe("EST");
  });
});

test.describe("dates", () => {
  test("shortDate and dateParts follow the zone too", () => {
    const late = "2026-08-19 21:30:00";
    expect(shortDate(late)).toBe("Aug 19, 2026");
    expect(shortDate(late, EAST)).toBe("Aug 20, 2026");
    expect(dateParts(late)).toEqual({ month: "Aug", day: 19 });
    expect(dateParts(late, EAST)).toEqual({ month: "Aug", day: 20 });
  });
});

test.describe("dayShift", () => {
  test("is zero for the chapter's own zone", () => {
    expect(dayShift("2026-08-19 21:30:00")).toBe(0);
    expect(dayShift("2026-08-19 21:30:00", CHAPTER_TIMEZONE)).toBe(0);
  });

  test("flags a late meeting that lands tomorrow further east", () => {
    // 9:30pm Pacific is 12:30am the next day in New York — and the calendar
    // still files it under the chapter's day, so the list has to say so.
    expect(dayShift("2026-08-19 21:30:00", EAST)).toBe(1);
    expect(dayShift("2026-08-19 21:30:00", IST)).toBe(1);
  });

  test("is silent for the ordinary case", () => {
    // A 6:30pm meeting is 9:30pm back east — same day, no marker.
    expect(dayShift("2026-08-19 18:30:00", EAST)).toBe(0);
  });

  test("goes negative for a zone behind the chapter", () => {
    // 00:30 Pacific is still the previous evening in Hawaii.
    expect(dayShift("2026-08-19 00:30:00", "Pacific/Honolulu")).toBe(-1);
  });
});
