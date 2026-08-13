/**
 * Full event detail — imported ONLY by the event route so the ~660 KB of
 * descriptions/venues never loads on the calendar or any other page.
 *
 * Recurring events are stored once (with a `recurrence` rule); this module
 * resolves three kinds of URL against that data:
 *
 *   /event/<one-off>/            → the stored row
 *   /event/<series>/             → the series itself, next occurrence applied
 *   /event/<series>/<date>/      → that occurrence, synthesized from the rule
 *                                  (works for dates past the prerendered
 *                                  window — those pages render client-side)
 */

import eventsFullData from "../../content/generated/events-full.json";
import { occurrences, type Recurrence } from "./recurrence";

export interface EventFull {
  /** WordPress numeric id for one-offs; `<seriesId>-<date>` for occurrences. */
  id: string | number;
  path: string;
  /** Set when this row was derived from a recurring series. */
  seriesSlug: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  descriptionHtml: string;
  cost: string | null;
  website: string | null;
  isVirtual: boolean;
  virtualUrl: string | null;
  venue: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  organizer: string | null;
  categories: string[];
  image: string | null;
  /** Present on series rows only. */
  recurrence?: Recurrence;
}

export const eventsFull = eventsFullData as unknown as EventFull[];

const normalize = (p: string) => (p.endsWith("/") ? p : p + "/");
const DATE_TAIL = /(\d{4}-\d{2}-\d{2})\/$/;

/** Replace the date portion of a wall-clock timestamp, keeping the time. */
const onDate = (stamp: string, date: string) =>
  stamp ? date + stamp.slice(10) : stamp;

export interface ResolvedEvent extends EventFull {
  /** For a series URL with no date: the next occurrence we're showing. */
  occurrenceDate?: string;
  /** Upcoming dates to list on a series page. */
  upcomingDates?: string[];
  /** True when this row came from a rule rather than a prerendered occurrence. */
  derived?: boolean;
}

/**
 * Resolve a pathname to a concrete event.
 *
 * `today` lets the caller pass the *client's* date so a stale build still shows
 * the right "next occurrence"; it defaults to the build's date.
 */
export function getEvent(
  pathname: string,
  today?: string,
): ResolvedEvent | undefined {
  const want = normalize(pathname);

  // 1. Exact match — every one-off, and every prerendered occurrence.
  const exact = eventsFull.find((e) => normalize(e.path) === want);
  if (exact && !exact.recurrence) return exact;

  // 2. A series URL: /event/<series>/ → show the next occurrence.
  if (exact?.recurrence) {
    const from = today ?? exact.start.slice(0, 10);
    const dates = occurrences(
      exact.recurrence,
      exact.start,
      from,
      addDays(from, 365),
    );
    const next = dates[0];
    return {
      ...exact,
      start: next ? onDate(exact.start, next) : exact.start,
      end: next ? onDate(exact.end, next) : exact.end,
      occurrenceDate: next,
      upcomingDates: dates.slice(0, 8),
      derived: true,
    };
  }

  // 3. A dated occurrence with no prerendered page: synthesize from the rule.
  const m = want.match(DATE_TAIL);
  if (!m) return undefined;
  const date = m[1];
  const seriesPath = want.slice(0, m.index);
  const series = eventsFull.find(
    (e) => e.recurrence && normalize(e.path) === normalize(seriesPath),
  );
  if (!series?.recurrence) return undefined;
  // Only render dates the rule actually produces — no invented meetings.
  if (!occurrences(series.recurrence, series.start, date, date).length)
    return undefined;
  return {
    ...series,
    id: `${series.id}-${date}`,
    path: want,
    seriesSlug: seriesPath.replace(/^\/event\//, "").replace(/\/$/, ""),
    start: onDate(series.start, date),
    end: onDate(series.end, date),
    occurrenceDate: date,
    recurrence: series.recurrence,
    derived: true,
  };
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
