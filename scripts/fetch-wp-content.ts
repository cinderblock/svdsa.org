/**
 * One-time / on-demand migration tool — NOT part of the build or runtime.
 *
 * Pulls all pages, posts, and events out of the legacy WordPress site via its
 * public REST APIs and writes them into the repo as committed content files
 * (`content/*.json`). The built site reads ONLY those local files; it never
 * talks to WordPress. Re-run this to re-sync from WP until WP is retired:
 *
 *   bun run scripts/fetch-wp-content.ts
 *
 * Raw API responses are cached under `content/.raw/` (gitignored) for
 * debugging / re-processing without hitting the live API again.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SITE = "https://siliconvalleydsa.org";
const OUT = join(import.meta.dirname, "..", "content");
const RAW = join(OUT, ".raw");
const UA = "svdsa-static-migration/1.0 (one-time content export)";

/** Be gentle with the live site. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<{ data: T; res: Response }> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const data = (await res.json()) as T;
  await sleep(150);
  return { data, res };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Live URL -> site-relative path, e.g. "/about/". */
function pathOf(link: string): string {
  try {
    return new URL(link).pathname;
  } catch {
    return link;
  }
}

async function writeJson(name: string, value: unknown) {
  await writeFile(join(OUT, name), JSON.stringify(value, null, 2) + "\n");
}
async function writeRaw(name: string, value: unknown) {
  await writeFile(join(RAW, name), JSON.stringify(value, null, 2) + "\n");
}

// ---- WordPress pages & posts (wp/v2) ----------------------------------------

interface WpItem {
  id: number;
  date: string;
  modified: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  parent?: number;
  menu_order?: number;
  featured_media: number;
  categories?: number[];
  _embedded?: {
    "wp:featuredmedia"?: { source_url?: string }[];
    "wp:term"?: {
      id: number;
      name: string;
      slug: string;
      taxonomy: string;
    }[][];
  };
}

async function fetchWpType(type: "pages" | "posts") {
  const all: WpItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `${SITE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_embed=wp:featuredmedia,wp:term`;
    const { data, res } = await getJson<WpItem[]>(url);
    totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    all.push(...data);
    console.log(`  ${type}: page ${page}/${totalPages} (+${data.length})`);
    page++;
  } while (page <= totalPages);
  await writeRaw(`${type}.json`, all);
  return all;
}

function normalizePage(p: WpItem) {
  return {
    id: p.id,
    slug: p.slug,
    path: pathOf(p.link),
    title: decodeEntities(p.title.rendered),
    html: p.content.rendered,
    excerpt: stripHtml(decodeEntities(p.excerpt.rendered)),
    parent: p.parent ?? 0,
    order: p.menu_order ?? 0,
    modified: p.modified,
    featuredImage: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null,
  };
}

function normalizePost(p: WpItem) {
  const terms = (p._embedded?.["wp:term"] ?? []).flat();
  return {
    id: p.id,
    slug: p.slug,
    path: pathOf(p.link),
    title: decodeEntities(p.title.rendered),
    date: p.date,
    modified: p.modified,
    html: p.content.rendered,
    excerpt: stripHtml(decodeEntities(p.excerpt.rendered)),
    categories: terms
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.name),
    tags: terms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name),
    featuredImage: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null,
  };
}

// ---- The Events Calendar (tribe/events/v1) ----------------------------------

interface TribeEvent {
  id: number;
  slug: string;
  url: string;
  title: string;
  description: string;
  excerpt: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  timezone: string;
  cost: string;
  website: string;
  is_virtual: boolean;
  virtual_url: string | null;
  venue?:
    | {
        venue?: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
      }
    | unknown[];
  organizer?: { organizer?: string }[] | unknown[];
  categories?: { name: string; slug: string }[];
  image?: { url?: string } | false;
}

async function fetchEvents() {
  const all: TribeEvent[] = [];
  let page = 1;
  let totalPages = 1;
  // start_date far in the past so we capture historical events too, not just upcoming.
  const base = `${SITE}/wp-json/tribe/events/v1/events?per_page=50&start_date=2015-01-01%2000:00:00`;
  do {
    const { data } = await getJson<{
      events: TribeEvent[];
      total_pages: number;
    }>(`${base}&page=${page}`);
    totalPages = data.total_pages ?? 1;
    all.push(...(data.events ?? []));
    console.log(
      `  events: page ${page}/${totalPages} (+${data.events?.length ?? 0})`,
    );
    page++;
  } while (page <= totalPages);
  await writeRaw("events.json", all);
  return all;
}

function normalizeEvent(e: TribeEvent) {
  const venue = !Array.isArray(e.venue) && e.venue ? e.venue : undefined;
  const organizer =
    Array.isArray(e.organizer) && e.organizer.length
      ? (e.organizer[0] as { organizer?: string })
      : undefined;
  return {
    id: e.id,
    slug: e.slug,
    path: pathOf(e.url),
    title: decodeEntities(e.title),
    start: e.start_date,
    end: e.end_date,
    allDay: e.all_day,
    timezone: e.timezone,
    descriptionHtml: e.description,
    excerpt: stripHtml(decodeEntities(e.excerpt || e.description)).slice(
      0,
      280,
    ),
    cost: e.cost || null,
    website: e.website || null,
    isVirtual: e.is_virtual,
    virtualUrl: e.virtual_url,
    venue: venue?.venue
      ? {
          name: decodeEntities(venue.venue),
          address: venue.address ?? null,
          city: venue.city ?? null,
          state: venue.state ?? null,
          zip: venue.zip ?? null,
        }
      : null,
    organizer: organizer?.organizer
      ? decodeEntities(organizer.organizer)
      : null,
    categories: (e.categories ?? []).map((c) => c.name),
    image: !e.image ? null : (e.image.url ?? null),
  };
}

// ---- main -------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
await mkdir(RAW, { recursive: true });

console.log("Fetching pages…");
const pages = (await fetchWpType("pages"))
  .map(normalizePage)
  .sort((a, b) => a.path.localeCompare(b.path));

console.log("Fetching posts…");
const posts = (await fetchWpType("posts"))
  .map(normalizePost)
  .sort((a, b) => b.date.localeCompare(a.date));

console.log("Fetching events…");
const events = (await fetchEvents())
  .map(normalizeEvent)
  .sort((a, b) => a.start.localeCompare(b.start));

await writeJson("pages.json", pages);
await writeJson("posts.json", posts);
await writeJson("events.json", events);
await writeJson("index.json", {
  source: SITE,
  counts: { pages: pages.length, posts: posts.length, events: events.length },
});

console.log(
  `\nDone. pages=${pages.length} posts=${posts.length} events=${events.length}\nWritten to ${OUT}`,
);
