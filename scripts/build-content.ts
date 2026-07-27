/**
 * Content assembler. Runs before dev/typecheck/build (see package.json).
 *
 * Reads the committed per-item Markdown source (content/{pages,posts,events}
 * recursively — produced by scripts/fetch-wp-content.ts) and assembles the JSON
 * the app imports. Those JSON files are GENERATED, git-ignored build artifacts
 * (content/generated/) — never hand-edited and never committed, so two people
 * adding content don't conflict on a shared file.
 *
 * Outputs (content/generated/):
 *   pages.json           full pages (content route)
 *   posts.json           full posts (content route)
 *   posts-index.json     slim post metadata (home, blog)
 *   events-upcoming.json slim upcoming events (home, calendar)
 *   events-full.json     full upcoming events (event route)
 * Plus public/sitemap.xml, public/robots.txt, and the public/calendar/*.ics
 * subscription feeds (all / per-facet / per-category / per-event).
 *
 * Network-free. Safe to run any time.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { categorySlug, FACETS, matchesFacet } from "../app/lib/eventFacets";
import { expandSeries, type Repeats } from "./expand-recurring";
import { icalendar, rruleFor, utcStamp, type IcsEvent } from "./ics";
import { renderMarkdown } from "./render-markdown";

const CONTENT = join(import.meta.dirname, "..", "content");
const GENERATED = join(CONTENT, "generated");
const PUBLIC = join(import.meta.dirname, "..", "public");

const SITE_URL = (
  process.env.SITE_URL ?? "https://siliconvalleydsa.org"
).replace(/\/$/, "");

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const excerptFrom = (html: string, len: number) => {
  const text = stripHtml(html);
  return text.length > len ? text.slice(0, len) : text;
};

/** Read + parse every .md under content/<dir>; bodies are Markdown, rendered
 * to HTML here so the app keeps consuming ready-to-inject HTML. */
async function readCollection(dir: string) {
  const root = join(CONTENT, dir);
  let entries: string[] = [];
  try {
    entries = (await readdir(root, { recursive: true })) as string[];
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md"));
  return Promise.all(
    files.map(async (f) => {
      const parsed = matter(await readFile(join(root, f), "utf8"));
      return {
        data: parsed.data as Record<string, unknown>,
        body: await renderMarkdown(parsed.content.trim()),
      };
    }),
  );
}

// ---- Assemble collections ---------------------------------------------------

const pageDocs = await readCollection("pages");
const postDocs = await readCollection("posts");
const eventDocs = await readCollection("events");

const pages = pageDocs
  .map(({ data, body }) => ({
    id: data.id as number,
    slug: data.slug as string,
    path: data.path as string,
    title: data.title as string,
    html: body,
    excerpt: excerptFrom(body, 200),
    parent: (data.parent as number) ?? 0,
    order: (data.order as number) ?? 0,
    modified: (data.modified as string) ?? "",
    featuredImage: (data.featuredImage as string) ?? null,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

const posts = postDocs
  .map(({ data, body }) => ({
    id: data.id as number,
    slug: data.slug as string,
    path: data.path as string,
    title: data.title as string,
    date: data.date as string,
    modified: (data.modified as string) ?? "",
    html: body,
    excerpt: (data.excerpt as string) ?? excerptFrom(body, 200),
    categories: (data.categories as string[]) ?? [],
    tags: (data.tags as string[]) ?? [],
    featuredImage: (data.featuredImage as string) ?? null,
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

interface Venue {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// Expand recurring series (repeats: frontmatter) into dated instances over a
// rolling window; the daily cron rebuild keeps the window moving.
const HORIZON_DAYS = 180;
const nowDate = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000)
  .toISOString()
  .slice(0, 10);

const events = eventDocs
  .flatMap(({ data, body }) =>
    expandSeries(data, nowDate, horizon).map((d) => ({ data: d, body })),
  )
  .map(({ data, body }) => {
    const v = data.venue as Partial<Venue> | undefined;
    return {
      id: data.id as number,
      path: data.path as string,
      title: data.title as string,
      start: data.start as string,
      end: data.end as string,
      allDay: (data.allDay as boolean) ?? false,
      timezone: (data.timezone as string) ?? "America/Los_Angeles",
      descriptionHtml: body,
      cost: (data.cost as string) ?? null,
      website: (data.website as string) ?? null,
      isVirtual: (data.isVirtual as boolean) ?? false,
      virtualUrl: (data.virtualUrl as string) ?? null,
      venue: v
        ? {
            name: v.name ?? "",
            address: v.address ?? null,
            city: v.city ?? null,
            state: v.state ?? null,
            zip: v.zip ?? null,
          }
        : null,
      organizer: (data.organizer as string) ?? null,
      categories: (data.categories as string[]) ?? [],
      image: (data.image as string) ?? null,
    };
  })
  .sort((a, b) => a.start.localeCompare(b.start));

const today = new Date().toISOString().slice(0, 10);
const upcoming = events.filter((e) => e.start.slice(0, 10) >= today);

// ---- Derived shapes the app imports ----------------------------------------

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

const eventsUpcoming = upcoming.map((e) => ({
  id: e.id,
  path: e.path,
  title: e.title,
  start: e.start,
  end: e.end,
  allDay: e.allDay,
  isVirtual: e.isVirtual,
  venue: e.venue?.name ?? null,
  categories: e.categories,
  excerpt: excerptFrom(e.descriptionHtml, 280),
}));

await mkdir(GENERATED, { recursive: true });
const write = (name: string, value: unknown) =>
  writeFile(join(GENERATED, name), JSON.stringify(value, null, 2) + "\n");

const buildDate = new Date();
await write("site.json", {
  builtAt: buildDate.toISOString(),
  buildYear: buildDate.getFullYear(),
});
await write("pages.json", pages);
await write("posts.json", posts);
await write("posts-index.json", postsIndex);
await write("events-upcoming.json", eventsUpcoming);
await write("events-full.json", upcoming);

// ---- Calendar subscription feeds (.ics) -------------------------------------
//
// Static feeds so members can subscribe in Apple Calendar / Google Calendar /
// Outlook — matching (and slightly improving on) the WordPress site's
// "Subscribe to calendar" feature, which offered the same thing filtered by
// category. Recurring series become ONE VEVENT with an RRULE, so subscriptions
// keep producing occurrences even if the site isn't rebuilt.

/** Shared VEVENT mapper. `rrule` is set only for unexpanded series. */
function toIcs(e: {
  id: unknown;
  path: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  descriptionHtml: string;
  isVirtual?: boolean;
  virtualUrl?: string | null;
  venue?: Partial<Venue> | null;
  organizer?: string | null;
  categories?: string[];
  rrule?: string | null;
}): IcsEvent {
  const online = e.isVirtual || e.venue?.name === "Zoom";
  const url = `${SITE_URL}${e.path}`;
  const location = online
    ? e.virtualUrl || "Online"
    : [
        e.venue?.name,
        e.venue?.address,
        e.venue?.city,
        e.venue?.state,
        e.venue?.zip,
      ]
        .filter(Boolean)
        .join(", ");
  const text = stripHtml(e.descriptionHtml);
  return {
    // Stable across rebuilds: derived from the item's own identity.
    uid: `${e.id ?? e.path}@siliconvalleydsa.org`,
    title: e.title || "Event",
    start: e.start,
    end: e.end || undefined,
    allDay: e.allDay ?? false,
    description: text
      ? `${text.slice(0, 900)}${text.length > 900 ? "…" : ""}\n\n${url}`
      : url,
    location: location || undefined,
    url,
    categories: e.categories ?? [],
    organizer: e.organizer ?? undefined,
    rrule: e.rrule ?? null,
  };
}

/**
 * Aggregate feeds work from the UNEXPANDED docs: a series contributes one
 * VEVENT with an RRULE (so a subscription keeps generating occurrences
 * indefinitely), a one-off contributes itself while it's still upcoming.
 */
const feedEvents = eventDocs
  .map(({ data, body }) => {
    const rep = data.repeats as Repeats | undefined;
    const start = String(data.start ?? "");
    if (!start) return null;
    // One-offs (incl. irregular-series instances) only matter while upcoming.
    if (!rep && start.slice(0, 10) < today) return null;
    const v = data.venue as Partial<Venue> | undefined;
    return {
      ics: toIcs({
        id: data.id,
        path: String(data.path ?? ""),
        title: String(data.title ?? ""),
        start,
        end: data.end as string | undefined,
        allDay: data.allDay as boolean | undefined,
        descriptionHtml: body,
        isVirtual: data.isVirtual as boolean | undefined,
        virtualUrl: data.virtualUrl as string | null | undefined,
        venue: v ?? null,
        organizer: data.organizer as string | null | undefined,
        categories: data.categories as string[] | undefined,
        rrule: rep ? rruleFor(rep, start) : null,
      }),
      facetable: {
        categories: (data.categories as string[]) ?? [],
        isVirtual: (data.isVirtual as boolean) ?? false,
        venue: v?.name ?? null,
      },
    };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .sort((a, b) => a.ics.start.localeCompare(b.ics.start));

const CALENDAR_DIR = join(PUBLIC, "calendar");
await mkdir(join(CALENDAR_DIR, "category"), { recursive: true });
await mkdir(join(CALENDAR_DIR, "event"), { recursive: true });

const dtstamp = utcStamp(buildDate);
const writeFeed = (rel: string, name: string, list: IcsEvent[]) =>
  writeFile(
    join(CALENDAR_DIR, rel),
    icalendar({
      name,
      description: `${name} — ${SITE_URL}/calendar`,
      events: list,
      dtstamp,
    }),
  );

// Facet feeds — mirror the on-site filter buttons exactly (shared FACETS).
for (const facet of FACETS) {
  const list = feedEvents
    .filter((e) => matchesFacet(e.facetable, facet.key))
    .map((e) => e.ics);
  await writeFeed(
    `${facet.slug}.ics`,
    facet.key === "all" ? "Silicon Valley DSA" : `SVDSA — ${facet.label}`,
    list,
  );
}

// Per-category feeds — subscribe to just your working group / committee.
const categories = [
  ...new Set(feedEvents.flatMap((e) => e.ics.categories ?? [])),
].sort();
for (const cat of categories) {
  const list = feedEvents
    .filter((e) => (e.ics.categories ?? []).includes(cat))
    .map((e) => e.ics);
  await writeFeed(`category/${categorySlug(cat)}.ics`, `SVDSA — ${cat}`, list);
}

// Per-event feeds — one per prerendered event page (so "Add to calendar" can
// never 404). These come from the EXPANDED list, so a recurring instance page
// downloads just that occurrence, not the whole series.
for (const e of upcoming) {
  const stem = e.path
    .replace(/^\/event\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "-");
  if (!stem) continue;
  await writeFeed(`event/${stem}.ics`, e.title, [toIcs({ ...e, rrule: null })]);
}

// ---- sitemap.xml + robots.txt ----------------------------------------------

interface Entry {
  path: string;
  lastmod?: string;
}
const overridden = new Set(["/", "/blog/", "/join/", "/donate/", "/contact/"]);
const urls: Entry[] = [
  { path: "/" },
  { path: "/calendar" },
  { path: "/blog" },
  { path: "/join/" },
  { path: "/donate/" },
  { path: "/contact/" },
  ...pages
    .filter((p) => !overridden.has(p.path))
    .map((p) => ({
      path: p.path,
      lastmod: p.modified?.slice(0, 10) || undefined,
    })),
  ...posts.map((p) => ({
    path: p.path,
    lastmod: (p.modified || p.date)?.slice(0, 10),
  })),
  ...eventsUpcoming.map((e) => ({ path: e.path })),
];

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url><loc>${SITE_URL}${u.path}</loc>` +
        (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "") +
        `</url>`,
    )
    .join("\n") +
  `\n</urlset>\n`;

await writeFile(join(PUBLIC, "sitemap.xml"), sitemap);
await writeFile(
  join(PUBLIC, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

console.log(
  `build-content: ${pages.length} pages, ${posts.length} posts, ` +
    `${events.length} events (${upcoming.length} upcoming), ${urls.length} sitemap URLs`,
);
