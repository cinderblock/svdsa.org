/**
 * Slim, index-only data for list/landing pages (home, blog, calendar).
 *
 * Deliberately does NOT import the full pages.json / posts.json (which carry
 * every article's HTML body). Those live in content.ts and load only on the
 * content route, so index pages stay light.
 */

import postsIndexData from "../../content/generated/posts-index.json";
import eventsData from "../../content/generated/events-upcoming.json";
import seriesData from "../../content/generated/events-series.json";
import { occurrences, type Recurrence } from "./recurrence";

export interface PostIndex {
  id: number;
  slug: string;
  path: string;
  title: string;
  date: string;
  excerpt: string;
  categories: string[];
  featuredImage: string | null;
}

export interface EventSlim {
  /** Numeric for one-offs; `<seriesId>-<date>` for recurring occurrences. */
  id: string | number;
  path: string;
  /** Set when this row was derived from a recurring series. */
  seriesSlug: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  isVirtual: boolean;
  venue: string | null;
  categories: string[];
  excerpt: string;
}

/** A recurring series: template fields plus the rule to expand. */
export interface EventSeries extends Omit<
  EventSlim,
  "id" | "seriesSlug" | "end"
> {
  id: string;
  slug: string;
  end: string;
  recurrence: Recurrence;
}

export const postsIndex = postsIndexData as PostIndex[];

/**
 * Build-time snapshot: every upcoming one-off plus series occurrences inside
 * the prerendered window. Correct at build; used for the initial (pre-hydration)
 * render — see expandEvents() for the always-fresh version.
 */
export const upcomingEvents = eventsData as unknown as EventSlim[];

/** The recurring series, so the browser can extend the list past the window. */
export const eventSeries = seriesData as unknown as EventSeries[];

/**
 * The full upcoming list as of `today`, computed from one-offs + recurrence
 * rules. Because occurrences are derived rather than baked, this stays correct
 * however long ago the site was built.
 */
export function expandEvents(today: string, days = 365): EventSlim[] {
  const to = addDays(today, days);
  const oneOffs = upcomingEvents.filter((e) => !e.seriesSlug);
  const derived = eventSeries.flatMap((s) =>
    occurrences(s.recurrence, s.start, today, to).map((date) => ({
      ...s,
      id: `${s.id}-${date}`,
      seriesSlug: s.slug,
      path: `${s.path}${date}/`,
      start: date + s.start.slice(10),
      end: s.end ? date + s.end.slice(10) : "",
    })),
  );
  return [...oneOffs, ...derived]
    .filter((e) => e.start.slice(0, 10) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
