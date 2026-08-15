/**
 * The pure state model behind the recurrence editor: RRULE string ⇄ form
 * controls. Kept separate from the React component so the round-trip can be
 * tested directly — opening a series and saving it untouched must NOT rewrite
 * its rule (that would churn every meeting's frontmatter on any edit).
 */

import { parseRRule, WEEKDAYS, type Weekday } from "../../app/lib/recurrence";

export interface Draft {
  freq: "WEEKLY" | "MONTHLY";
  interval: number;
  days: Weekday[];
  /**
   * Monthly only: which occurrences in the month, each 1..5 or -1 for "last".
   *
   * A LIST, not one value, because three chapter meetings genuinely happen
   * twice a month on the same weekday — `2TH,4TH`, `2WE,4WE`, `1TU,3TU`. When
   * this was a single number those rules round-tripped to `2TH`, quietly
   * deleting the second meeting of every month from the calendar and the feeds.
   *
   * Order is preserved rather than sorted: re-ordering is churn, and it would
   * also move `-1` (last) in front of the positive ordinals.
   */
  nths: number[];
  /** '' = no end date. */
  until: string;
}

/** De-duplicate, keeping first-seen order — sorting would be churn. */
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Weekday of a YYYY-MM-DD date (UTC-safe: parsed at noon). */
export function weekdayOfDate(ymd: string): Weekday {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "MO" : (WEEKDAYS[d.getUTCDay()] ?? "MO");
}

export function toDraft(
  rec: { rrule: string } | null,
  anchorWeekday: Weekday,
): Draft {
  const base: Draft = {
    freq: "WEEKLY",
    interval: 1,
    days: [anchorWeekday],
    nths: [1],
    until: "",
  };
  if (!rec) return base;
  try {
    const p = parseRRule(rec.rrule);
    return {
      freq: p.freq,
      interval: p.interval,
      // Monthly rules repeat the same weekday per ordinal (2TH,4TH), so the
      // weekday list must be de-duplicated or the widget shows Thursday twice.
      days: uniq(p.byday.length ? p.byday.map((b) => b.day) : [anchorWeekday]),
      nths: p.byday.length ? uniq(p.byday.map((b) => b.nth ?? 1)) : [1],
      until: p.until ?? "",
    };
  } catch {
    return base; // unparseable rule: fall back rather than trap the editor
  }
}

export function toRRule(d: Draft): string {
  const parts: string[] = [`FREQ=${d.freq}`];
  if (d.freq === "WEEKLY") {
    if (d.interval > 1) parts.push(`INTERVAL=${d.interval}`);
    parts.push(`BYDAY=${(d.days.length ? d.days : ["MO"]).join(",")}`);
  } else {
    if (d.interval > 1) parts.push(`INTERVAL=${d.interval}`);
    const day = d.days[0] ?? "MO";
    const nths = d.nths.length ? d.nths : [1];
    parts.push(`BYDAY=${nths.map((n) => `${n}${day}`).join(",")}`);
  }
  if (d.until) parts.push(`UNTIL=${d.until.replace(/-/g, "")}`);
  return parts.join(";");
}
