/**
 * Slim, index-only data for list/landing pages (home, blog, calendar).
 *
 * Deliberately does NOT import the full pages.json / posts.json (which carry
 * every article's HTML body). Those live in content.ts and load only on the
 * content route, so index pages stay light.
 */

import postsIndexData from "../../content/generated/posts-index.json";
import eventsData from "../../content/generated/events-upcoming.json";

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
  /** Numeric for one-offs; `<seriesId>-<date>` for recurring instances. */
  id: string | number;
  path: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  isVirtual: boolean;
  venue: string | null;
  categories: string[];
  excerpt: string;
}

export const postsIndex = postsIndexData as PostIndex[];
export const upcomingEvents = eventsData as EventSlim[];
