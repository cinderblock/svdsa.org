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
  /** Monthly only: 1..5, or -1 for "last". */
  nth: number;
  /** '' = no end date. */
  until: string;
}

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
    nth: 1,
    until: "",
  };
  if (!rec) return base;
  try {
    const p = parseRRule(rec.rrule);
    return {
      freq: p.freq,
      interval: p.interval,
      days: p.byday.length ? p.byday.map((b) => b.day) : [anchorWeekday],
      nth: p.byday[0]?.nth ?? 1,
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
    parts.push(`BYDAY=${d.nth}${d.days[0] ?? "MO"}`);
  }
  if (d.until) parts.push(`UNTIL=${d.until.replace(/-/g, "")}`);
  return parts.join(";");
}
