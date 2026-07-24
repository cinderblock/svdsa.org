/**
 * Recurring-event expansion. A series is ONE file (content/events/<slug>.md)
 * with a `repeats:` block; build-content expands it into dated instances over
 * a rolling window (the daily cron rebuild keeps the window moving), instead
 * of WordPress's approach of pre-generating hundreds of instance files.
 *
 *   repeats:
 *     freq: weekly | monthly
 *     interval: 1          # weekly only: 2 = biweekly (anchored on `start`)
 *     byday: 3SA           # monthly only: nth weekday; -1SU = last Sunday
 *     until: '2027-01-01'  # optional series end (inclusive)
 *
 * `start`/`end` give the time-of-day and (for weekly) the anchor date; `path`
 * is the series base (/event/<slug>/) — instances get `<date>/` appended and
 * an id suffix, matching the WP URL shape so old links keep working.
 */

export interface Repeats {
  freq: "weekly" | "monthly";
  interval?: number;
  byday?: string;
  until?: string;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 86_400_000;

const toUtc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dateOf = (start: string) => start.slice(0, 10);
const timeOf = (s: string) => s.slice(10); // keeps the original separator+time

/** Dates (YYYY-MM-DD) the series occurs on within [from, to] inclusive. */
export function occurrences(
  rep: Repeats,
  anchorStart: string,
  from: string,
  to: string,
): string[] {
  const end = rep.until && rep.until < to ? rep.until : to;
  const out: string[] = [];
  if (rep.freq === "weekly") {
    const interval = Math.max(1, rep.interval ?? 1);
    const anchor = toUtc(dateOf(anchorStart));
    let t = anchor;
    // Jump close to the window start, preserving the anchor's phase.
    if (fromUtc(t) < from) {
      const steps = Math.floor(
        (toUtc(from) - anchor) / (interval * 7 * DAY_MS),
      );
      t = anchor + steps * interval * 7 * DAY_MS;
    }
    for (; fromUtc(t) <= end; t += interval * 7 * DAY_MS)
      if (fromUtc(t) >= from) out.push(fromUtc(t));
  } else {
    const m = (rep.byday ?? "").match(/^(-?\d)([A-Z]{2})$/);
    if (!m) return [];
    const nth = Number(m[1]);
    const wd = WEEKDAYS.indexOf(m[2]);
    if (wd === -1) return [];
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = end.split("-").map(Number);
    for (
      let y = fy, mo = fm;
      y < ty || (y === ty && mo <= tm);
      mo === 12 ? ((mo = 1), y++) : mo++
    ) {
      const date = nthWeekday(y, mo, nth, wd);
      if (date && date >= from && date <= end) out.push(date);
    }
  }
  return out;
}

/** The nth (1-5, or -1 = last) `weekday` of a month, or null if absent. */
function nthWeekday(
  year: number,
  month: number,
  nth: number,
  weekday: number,
): string | null {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (nth === -1) {
    for (let d = daysInMonth; d > daysInMonth - 7; d--) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday)
        return fromUtc(Date.UTC(year, month - 1, d));
    }
    return null;
  }
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return day <= daysInMonth ? fromUtc(Date.UTC(year, month - 1, day)) : null;
}

/** Expand a series doc's frontmatter into per-instance frontmatter objects. */
export function expandSeries(
  data: Record<string, unknown>,
  from: string,
  to: string,
): Record<string, unknown>[] {
  const rep = data.repeats as Repeats | undefined;
  if (!rep) return [data];
  const start = String(data.start ?? "");
  const end = String(data.end ?? start);
  if (!start) return [];
  const basePath = String(data.path ?? "").replace(/\/$/, "");
  return occurrences(rep, start, from, to).map((date) => ({
    ...data,
    repeats: undefined,
    id: `${data.id}-${date}`,
    path: `${basePath}/${date}/`,
    start: date + timeOf(start),
    end: end ? date + timeOf(end) : undefined,
  }));
}
