/**
 * Network-free content derivation. Runs before the build (see package.json).
 *
 * Reads the committed full content in `content/` (produced by the one-time
 * fetch-wp-content.ts migration) and derives the slim artifacts the client
 * actually ships:
 *
 *   content/events-upcoming.json  — upcoming events, minimal fields, for the
 *                                    calendar/home lists. Keeps the 1.8 MB full
 *                                    events file out of the browser entirely.
 *   content/events-full.json      — upcoming events WITH full detail
 *                                    (description, venue, organizer). Imported
 *                                    only by the event route, so detail loads
 *                                    only when viewing an event.
 *   content/posts-index.json      — post metadata + excerpts WITHOUT the full
 *                                    HTML bodies, so index pages (home, blog)
 *                                    don't pull every article's body.
 *
 * Safe to run any time; no external calls. Re-run after re-migrating.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "content");

const read = async (name: string) =>
  JSON.parse(await readFile(join(DIR, name), "utf8"));

interface FullEvent {
  id: number;
  slug: string;
  path: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  descriptionHtml: string;
  excerpt: string;
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
}

interface FullPost {
  id: number;
  slug: string;
  path: string;
  title: string;
  date: string;
  excerpt: string;
  categories: string[];
  featuredImage: string | null;
}

const events = (await read("events.json")) as FullEvent[];
const posts = (await read("posts.json")) as FullPost[];

// "Now" as a plain YYYY-MM-DD so it compares against the stored local-time
// start strings without timezone surprises.
const today = new Date().toISOString().slice(0, 10);

const upcomingEvents = events
  .filter((e) => e.start.slice(0, 10) >= today)
  .sort((a, b) => a.start.localeCompare(b.start));

// Slim list for calendar/home.
const eventsUpcoming = upcomingEvents.map((e) => ({
  id: e.id,
  path: e.path,
  title: e.title,
  start: e.start,
  end: e.end,
  allDay: e.allDay,
  isVirtual: e.isVirtual,
  venue: e.venue?.name ?? null,
  categories: e.categories,
  excerpt: e.excerpt,
}));

// Full detail for the event route (keyed lookups by path).
const eventsFull = upcomingEvents.map((e) => ({
  id: e.id,
  path: e.path,
  title: e.title,
  start: e.start,
  end: e.end,
  allDay: e.allDay,
  timezone: e.timezone,
  descriptionHtml: e.descriptionHtml,
  cost: e.cost,
  website: e.website,
  isVirtual: e.isVirtual,
  virtualUrl: e.virtualUrl,
  venue: e.venue,
  organizer: e.organizer,
  categories: e.categories,
  image: e.image,
}));

const postsIndex = posts.map((p) => ({
  id: p.id,
  slug: p.slug,
  path: p.path,
  title: p.title,
  date: p.date,
  excerpt: p.excerpt,
  categories: p.categories,
  featuredImage: p.featuredImage,
}));

await writeFile(
  join(DIR, "events-upcoming.json"),
  JSON.stringify(eventsUpcoming, null, 2) + "\n",
);
await writeFile(
  join(DIR, "events-full.json"),
  JSON.stringify(eventsFull, null, 2) + "\n",
);
await writeFile(
  join(DIR, "posts-index.json"),
  JSON.stringify(postsIndex, null, 2) + "\n",
);

console.log(
  `build-content: ${eventsUpcoming.length} upcoming events (slim + full), ` +
    `${postsIndex.length} post index entries`,
);
