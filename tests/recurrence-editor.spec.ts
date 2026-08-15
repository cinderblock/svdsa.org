/**
 * The editor's recurrence widget must round-trip every rule the chapter
 * actually uses.
 *
 * If opening a series and saving it untouched rewrote its rule, every edit
 * would churn meeting frontmatter (and could silently change dates). These
 * tests run the real corpus through the widget's RRULE ⇄ form-controls model.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { occurrences } from "../app/lib/recurrence";
import {
  toDraft,
  toRRule,
  weekdayOfDate,
} from "../editor/web/recurrence-model";

const series = JSON.parse(
  readFileSync("content/generated/events-series.json", "utf8"),
) as {
  slug: string;
  start: string;
  recurrence: { rrule: string; exdate?: string[]; rdate?: string[] };
}[];

test("every stored rule survives a round trip through the widget unchanged", () => {
  expect(series.length).toBeGreaterThan(10);
  for (const s of series) {
    const anchor = weekdayOfDate(s.start.slice(0, 10));
    const rebuilt = toRRule(toDraft(s.recurrence, anchor));
    expect(rebuilt, `${s.slug} rule churned`).toBe(s.recurrence.rrule);
  }
});

test("round-tripped rules produce identical dates", () => {
  for (const s of series) {
    const anchor = weekdayOfDate(s.start.slice(0, 10));
    const rebuilt = toRRule(toDraft(s.recurrence, anchor));
    expect(
      occurrences(
        { ...s.recurrence, rrule: rebuilt },
        s.start,
        "2026-08-01",
        "2027-06-30",
      ),
    ).toEqual(occurrences(s.recurrence, s.start, "2026-08-01", "2027-06-30"));
  }
});

test("the widget's controls build the rules an editor would expect", () => {
  // Turning repetition ON for a Wednesday event defaults to weekly Wednesdays.
  expect(toRRule(toDraft(null, "WE"))).toBe("FREQ=WEEKLY;BYDAY=WE");
  // Every other Monday.
  expect(
    toRRule({
      freq: "WEEKLY",
      interval: 2,
      days: ["MO"],
      nths: [1],
      until: "",
    }),
  ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO");
  // Multi-day weekly.
  expect(
    toRRule({
      freq: "WEEKLY",
      interval: 1,
      days: ["TU", "TH"],
      nths: [1],
      until: "",
    }),
  ).toBe("FREQ=WEEKLY;BYDAY=TU,TH");
  // 3rd Saturday monthly, ending on a date.
  expect(
    toRRule({
      freq: "MONTHLY",
      interval: 1,
      days: ["SA"],
      nths: [3],
      until: "2027-06-30",
    }),
  ).toBe("FREQ=MONTHLY;BYDAY=3SA;UNTIL=20270630");
  // "last Sunday".
  expect(
    toRRule({
      freq: "MONTHLY",
      interval: 1,
      days: ["SU"],
      nths: [-1],
      until: "",
    }),
  ).toBe("FREQ=MONTHLY;BYDAY=-1SU");
  // TWICE a month on the same weekday. Three chapter meetings do this, and a
  // single-ordinal model rewrote them to just the first one — silently deleting
  // the month's second meeting from the calendar and the .ics feeds.
  expect(
    toRRule({
      freq: "MONTHLY",
      interval: 1,
      days: ["TH"],
      nths: [2, 4],
      until: "",
    }),
  ).toBe("FREQ=MONTHLY;BYDAY=2TH,4TH");
  // ...and it survives the trip back out of a stored rule.
  expect(toDraft({ rrule: "FREQ=MONTHLY;BYDAY=2TH,4TH" }, "TH")).toMatchObject({
    freq: "MONTHLY",
    days: ["TH"],
    nths: [2, 4],
  });
});

test("an unparseable rule falls back instead of trapping the editor", () => {
  // e.g. a rule hand-written in the raw Markdown mode that we don't support.
  const draft = toDraft({ rrule: "FREQ=DAILY;INTERVAL=3" }, "TH");
  expect(draft.freq).toBe("WEEKLY");
  expect(draft.days).toEqual(["TH"]);
});
