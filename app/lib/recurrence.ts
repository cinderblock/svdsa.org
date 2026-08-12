/**
 * Recurring events — the shared, first-class recurrence model.
 *
 * A recurring event is ONE content file carrying an iCalendar recurrence rule;
 * occurrences are DERIVED wherever they're needed (the build, the browser, the
 * .ics feeds) rather than baked into hundreds of files. That means the calendar
 * can't go stale: the browser expands the rule against the reader's own clock,
 * so a long-unbuilt site still shows correct upcoming dates.
 *
 * Frontmatter shape:
 *
 *   recurrence:
 *     rrule: FREQ=MONTHLY;BYDAY=3SA      # required
 *     exdate: ['2026-12-19']             # occurrences that DON'T happen
 *     rdate:  ['2026-12-12']             # extra one-off occurrences (moved to)
 *
 * Everything here works on **wall-clock date strings** (`YYYY-MM-DD`), never
 * `Date` instants. Times live on the event's `start`/`end`, so a 18:30 meeting
 * stays 18:30 across a DST boundary — the bug you get from adding 7×24h to a
 * timestamp.
 *
 * Deliberately dependency-free and small enough to ship to the browser. It
 * implements the subset the chapter actually uses (weekly/monthly by weekday);
 * `parseRRule` THROWS on anything it can't honour, so an unsupported rule fails
 * the build loudly instead of silently dropping meetings. Conformance is
 * verified against the reference `rrule` implementation in
 * `tests/recurrence.spec.ts`.
 */

export interface Recurrence {
  rrule: string;
  exdate?: string[];
  rdate?: string[];
}

export type Weekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export interface ParsedRRule {
  freq: "WEEKLY" | "MONTHLY";
  interval: number;
  /** Weekly: plain weekdays. Monthly: nth-weekday (`nth` = 1..5 or -1). */
  byday: { nth: number | null; day: Weekday }[];
  until: string | null;
  count: number | null;
}

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' → UTC epoch ms at midnight (a pure calendar-date handle). */
function toDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
/** Inverse of toDay. */
function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
const weekdayOf = (ms: number): Weekday => WEEKDAYS[new Date(ms).getUTCDay()];

/** Accepts '2026-12-19', '20261219', or a full timestamp; yields 'YYYY-MM-DD'. */
export function normalizeDate(v: string): string {
  const s = String(v).trim();
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return s.slice(0, 10);
}

export function parseRRule(rule: string): ParsedRRule {
  const parts = new Map<string, string>();
  for (const chunk of rule
    .trim()
    .replace(/^RRULE:/i, "")
    .split(";")) {
    if (!chunk) continue;
    const i = chunk.indexOf("=");
    if (i === -1) throw new Error(`RRULE: malformed part "${chunk}"`);
    parts.set(
      chunk.slice(0, i).toUpperCase(),
      chunk.slice(i + 1).toUpperCase(),
    );
  }

  const freq = parts.get("FREQ");
  if (freq !== "WEEKLY" && freq !== "MONTHLY")
    throw new Error(
      `RRULE: unsupported FREQ=${freq ?? "(missing)"} — only WEEKLY and MONTHLY are implemented`,
    );

  for (const key of parts.keys())
    if (!["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"].includes(key))
      throw new Error(`RRULE: unsupported part ${key}`);

  const byday = (parts.get("BYDAY") ?? "")
    .split(",")
    .filter(Boolean)
    .map((tok) => {
      const m = tok.match(/^(-?\d)?([A-Z]{2})$/);
      if (!m) throw new Error(`RRULE: bad BYDAY token "${tok}"`);
      const day = m[2] as Weekday;
      if (!WEEKDAYS.includes(day))
        throw new Error(`RRULE: bad weekday "${day}"`);
      return { nth: m[1] ? Number(m[1]) : null, day };
    });

  if (freq === "MONTHLY" && byday.some((b) => b.nth === null))
    throw new Error(
      "RRULE: FREQ=MONTHLY needs an ordinal BYDAY (e.g. 3SA or -1SU)",
    );

  const interval = Number(parts.get("INTERVAL") ?? 1);
  if (!Number.isInteger(interval) || interval < 1)
    throw new Error(`RRULE: bad INTERVAL=${parts.get("INTERVAL")}`);

  const countRaw = parts.get("COUNT");
  const count = countRaw === undefined ? null : Number(countRaw);
  if (count !== null && (!Number.isInteger(count) || count < 1))
    throw new Error(`RRULE: bad COUNT=${countRaw}`);

  return {
    freq,
    interval,
    byday,
    until: parts.get("UNTIL") ? normalizeDate(parts.get("UNTIL")!) : null,
    count,
  };
}

/** The nth (1..5, or -1 = last) `day` of a month, or null if it doesn't exist. */
function nthWeekdayOfMonth(
  year: number,
  month1: number,
  nth: number,
  day: Weekday,
): string | null {
  const target = WEEKDAYS.indexOf(day);
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  if (nth < 0) {
    for (let d = daysInMonth; d > daysInMonth - 7; d--)
      if (new Date(Date.UTC(year, month1 - 1, d)).getUTCDay() === target)
        return toYmd(Date.UTC(year, month1 - 1, d));
    return null;
  }
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  const date = 1 + ((target - firstDow + 7) % 7) + (nth - 1) * 7;
  return date <= daysInMonth ? toYmd(Date.UTC(year, month1 - 1, date)) : null;
}

/**
 * Dates generated by the rule itself, from `dtstart` onward, bounded by
 * `windowEnd` (and by UNTIL/COUNT). EXDATE/RDATE are NOT applied here.
 */
function ruleDates(
  parsed: ParsedRRule,
  dtstart: string,
  windowEnd: string,
): string[] {
  const hardEnd =
    parsed.until && parsed.until < windowEnd ? parsed.until : windowEnd;
  const out: string[] = [];
  const startMs = toDay(dtstart);

  if (parsed.freq === "WEEKLY") {
    // Anchor the interval on dtstart's week (Sunday-based, matching WKST=SU).
    const days = parsed.byday.length
      ? parsed.byday.map((b) => b.day)
      : [weekdayOf(startMs)];
    const weekStart = startMs - new Date(startMs).getUTCDay() * DAY_MS;
    const step = parsed.interval * 7 * DAY_MS;
    for (let w = weekStart; w <= toDay(hardEnd); w += step) {
      for (const day of days) {
        const ms = w + WEEKDAYS.indexOf(day) * DAY_MS;
        if (ms < startMs) continue; // never before dtstart
        const ymd = toYmd(ms);
        if (ymd > hardEnd) continue;
        out.push(ymd);
      }
      if (parsed.count && out.length >= parsed.count) break;
    }
  } else {
    const [sy, sm] = dtstart.split("-").map(Number);
    const endMs = toDay(hardEnd);
    for (let i = 0; ; i += parsed.interval) {
      const month0 = sm - 1 + i;
      const year = sy + Math.floor(month0 / 12);
      const month1 = (((month0 % 12) + 12) % 12) + 1;
      // Stop once the whole month is past the window.
      if (toDay(toYmd(Date.UTC(year, month1 - 1, 1))) > endMs) break;
      for (const b of parsed.byday) {
        const ymd = nthWeekdayOfMonth(year, month1, b.nth!, b.day);
        if (!ymd || ymd < dtstart || ymd > hardEnd) continue;
        out.push(ymd);
      }
      if (parsed.count && out.length >= parsed.count) break;
      if (i > 1200) break; // safety valve (100 years of monthly steps)
    }
  }

  out.sort();
  return parsed.count ? out.slice(0, parsed.count) : out;
}

/**
 * All occurrence dates of a series within [from, to] inclusive.
 * RDATEs are added, EXDATEs removed, result sorted and de-duplicated.
 */
export function occurrences(
  rec: Recurrence,
  dtstart: string,
  from: string,
  to: string,
): string[] {
  const parsed = parseRRule(rec.rrule);
  const start = normalizeDate(dtstart);
  const excluded = new Set((rec.exdate ?? []).map(normalizeDate));
  const dates = new Set(
    ruleDates(parsed, start, to).filter((d) => !excluded.has(d)),
  );
  for (const extra of rec.rdate ?? []) {
    const d = normalizeDate(extra);
    if (!excluded.has(d)) dates.add(d);
  }
  return [...dates].filter((d) => d >= from && d <= to).sort();
}

/** The first occurrence on/after `from` (or null within a ~2-year horizon). */
export function nextOccurrence(
  rec: Recurrence,
  dtstart: string,
  from: string,
): string | null {
  const to = toYmd(toDay(from) + 730 * DAY_MS);
  return occurrences(rec, dtstart, from, to)[0] ?? null;
}

/** Human summary for UI: "Every other Monday", "3rd Saturday monthly". */
export function describeRecurrence(rec: Recurrence): string {
  let p: ParsedRRule;
  try {
    p = parseRRule(rec.rrule);
  } catch {
    return "Repeating event";
  }
  const NAMES: Record<Weekday, string> = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };
  const ORD = ["", "1st", "2nd", "3rd", "4th", "5th"];
  const days = p.byday.map((b) => NAMES[b.day]).join(" & ");
  if (p.freq === "WEEKLY") {
    if (p.interval === 1) return `Every ${days || "week"}`;
    if (p.interval === 2) return `Every other ${days || "week"}`;
    return `Every ${p.interval} weeks on ${days}`;
  }
  const every = p.interval === 1 ? "monthly" : `every ${p.interval} months`;
  const ordOf = (b: ParsedRRule["byday"][number]) =>
    b.nth === -1 ? "last" : ORD[b.nth ?? 1];
  // A rule like BYDAY=2WE,4WE names one weekday twice, so gather the ordinals
  // and say the day once — "2nd & 4th Wednesday", not "…Wednesday & Wednesday".
  const distinct = [...new Set(p.byday.map((b) => b.day))];
  const which =
    distinct.length === 1
      ? `${p.byday.map(ordOf).join(" & ")} ${NAMES[distinct[0]]}`
      : p.byday.map((b) => `${ordOf(b)} ${NAMES[b.day]}`).join(" & ");
  return `${which} ${every}`;
}
