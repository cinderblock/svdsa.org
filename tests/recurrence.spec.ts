/**
 * Conformance tests for our small recurrence engine (app/lib/recurrence.ts).
 *
 * The engine is hand-written so the browser doesn't have to download a full
 * RRULE library — but "hand-written date math" is exactly where silent bugs
 * live, so every rule the chapter uses is checked against the reference
 * `rrule` implementation (a devDependency; never shipped to the client).
 */

import { test, expect } from "@playwright/test";
// rrule ships CommonJS; import the default and destructure.
import rrulePkg from "rrule";
import {
  describeRecurrence,
  occurrences,
  parseRRule,
} from "../app/lib/recurrence";

const { RRule } = rrulePkg as unknown as typeof import("rrule");

/** Reference expansion: rrule lib, UTC dates, returned as YYYY-MM-DD. */
function reference(rule: string, dtstart: string, to: string): string[] {
  const [y, m, d] = dtstart.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const set = RRule.fromString(
    `DTSTART:${dtstart.replace(/-/g, "")}T000000Z\nRRULE:${rule.replace(/^RRULE:/i, "")}`,
  );
  return set
    .between(
      new Date(Date.UTC(y, m - 1, d)),
      new Date(Date.UTC(ty, tm - 1, td)),
      true,
    )
    .map((x) => x.toISOString().slice(0, 10));
}

// Every rule shape actually present in content/events/*.md, plus edge cases.
const RULES: { rule: string; dtstart: string; to: string }[] = [
  // weekly
  { rule: "FREQ=WEEKLY;BYDAY=SA", dtstart: "2026-07-25", to: "2027-08-01" },
  { rule: "FREQ=WEEKLY;BYDAY=SU", dtstart: "2026-07-26", to: "2027-08-01" },
  { rule: "FREQ=WEEKLY;BYDAY=TH", dtstart: "2026-07-30", to: "2027-08-01" },
  { rule: "FREQ=WEEKLY;BYDAY=WE", dtstart: "2026-08-05", to: "2027-08-01" },
  // biweekly — the phase-sensitive ones
  {
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
    dtstart: "2026-07-27",
    to: "2027-08-01",
  },
  {
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
    dtstart: "2026-08-03",
    to: "2027-08-01",
  },
  {
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
    dtstart: "2026-08-04",
    to: "2027-08-01",
  },
  {
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
    dtstart: "2026-08-06",
    to: "2027-08-01",
  },
  // monthly nth weekday
  { rule: "FREQ=MONTHLY;BYDAY=1TH", dtstart: "2026-08-06", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=1WE", dtstart: "2026-08-05", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=2SU", dtstart: "2026-08-09", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=3SA", dtstart: "2026-08-15", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=3WE", dtstart: "2026-08-19", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=4TU", dtstart: "2026-07-28", to: "2028-01-01" },
  // edge cases: 5th weekday (months that lack one must be skipped), last-of-month
  { rule: "FREQ=MONTHLY;BYDAY=5FR", dtstart: "2026-01-30", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=-1SU", dtstart: "2026-08-30", to: "2028-01-01" },
  { rule: "FREQ=MONTHLY;BYDAY=-1MO", dtstart: "2026-08-31", to: "2028-01-01" },
  // multi-day weekly, longer interval, bounded rules
  { rule: "FREQ=WEEKLY;BYDAY=TU,TH", dtstart: "2026-08-04", to: "2027-01-01" },
  {
    rule: "FREQ=WEEKLY;INTERVAL=3;BYDAY=FR",
    dtstart: "2026-08-07",
    to: "2027-06-01",
  },
  {
    rule: "FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU",
    dtstart: "2026-08-11",
    to: "2028-06-01",
  },
  {
    rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=7",
    dtstart: "2026-08-03",
    to: "2027-08-01",
  },
  {
    rule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130",
    dtstart: "2026-08-03",
    to: "2027-08-01",
  },
  // leap-year February
  { rule: "FREQ=MONTHLY;BYDAY=-1SA", dtstart: "2028-01-29", to: "2028-12-31" },
];

test.describe("recurrence engine matches the reference RRULE implementation", () => {
  for (const { rule, dtstart, to } of RULES) {
    test(`${rule} from ${dtstart}`, () => {
      const ours = occurrences({ rrule: rule }, dtstart, dtstart, to);
      const theirs = reference(rule, dtstart, to);
      expect(ours).toEqual(theirs);
      expect(ours.length).toBeGreaterThan(0);
    });
  }
});

test.describe("recurrence extras", () => {
  test("EXDATE removes an occurrence, RDATE adds one", () => {
    const rec = {
      rrule: "FREQ=MONTHLY;BYDAY=4TU",
      exdate: ["2026-12-22"],
      rdate: ["2026-12-15"],
    };
    const got = occurrences(rec, "2026-07-28", "2026-11-01", "2027-01-31");
    expect(got).toContain("2026-11-24");
    expect(got).not.toContain("2026-12-22"); // skipped
    expect(got).toContain("2026-12-15"); // moved to
    expect(got).toContain("2027-01-26");
  });

  test("an EXDATE also suppresses a colliding RDATE", () => {
    const got = occurrences(
      {
        rrule: "FREQ=WEEKLY;BYDAY=MO",
        exdate: ["2026-08-10"],
        rdate: ["2026-08-10"],
      },
      "2026-08-03",
      "2026-08-01",
      "2026-08-31",
    );
    expect(got).not.toContain("2026-08-10");
  });

  test("window bounds are inclusive and exclude pre-dtstart dates", () => {
    const got = occurrences(
      { rrule: "FREQ=WEEKLY;BYDAY=MO" },
      "2026-08-03",
      "2026-07-01",
      "2026-08-17",
    );
    expect(got).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  test("unsupported rules fail loudly rather than dropping meetings", () => {
    expect(() => parseRRule("FREQ=DAILY")).toThrow(/unsupported FREQ/i);
    expect(() => parseRRule("FREQ=MONTHLY;BYMONTHDAY=15")).toThrow(
      /unsupported part/i,
    );
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=SA")).toThrow(/ordinal BYDAY/i);
    expect(() => parseRRule("FREQ=WEEKLY;BYDAY=XX")).toThrow(/bad weekday/i);
    expect(() => parseRRule("FREQ=WEEKLY;BYDAY=1")).toThrow(/bad BYDAY/i);
  });

  test("human descriptions read naturally", () => {
    expect(describeRecurrence({ rrule: "FREQ=WEEKLY;BYDAY=WE" })).toBe(
      "Every Wednesday",
    );
    expect(
      describeRecurrence({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" }),
    ).toBe("Every other Monday");
    expect(describeRecurrence({ rrule: "FREQ=MONTHLY;BYDAY=3SA" })).toBe(
      "3rd Saturday monthly",
    );
    expect(describeRecurrence({ rrule: "FREQ=MONTHLY;BYDAY=-1SU" })).toBe(
      "last Sunday monthly",
    );
  });
});
