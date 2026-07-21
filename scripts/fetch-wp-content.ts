/**
 * One-time / on-demand migration tool — NOT part of the build or runtime.
 *
 * Pulls all pages, posts, and events out of the legacy WordPress site via its
 * public REST APIs and writes them into the repo as committed, per-item
 * Markdown files with YAML frontmatter:
 *
 *   content/posts/<year>/<date>-<slug>.md      (frontmatter + HTML body)
 *   content/events/<year>/<path-key>.md        (bucketed by start-date year)
 *   content/pages/<url-path>.md                (mirrors the page URL path)
 *
 * One file per item means new content is a new file (no shared-file merge
 * conflicts, no unbounded growth). This is the source of truth; the build
 * (scripts/build-content.ts) assembles these into the JSON the app imports.
 * The built site reads only local files — never WordPress — so WP can retire.
 *
 * Re-run to re-sync from WP (clears + rewrites the three dirs):
 *   bun run migrate
 *
 * Raw API responses are cached under content/.raw/ (gitignored) for debugging.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import matter from "gray-matter";

const SITE = "https://siliconvalleydsa.org";
const CONTENT = join(import.meta.dirname, "..", "content");
const RAW = join(CONTENT, ".raw");
const UA = "svdsa-static-migration/1.0 (one-time content export)";

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

/** Drop null/undefined/"" so frontmatter stays clean. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Write a Markdown file (frontmatter + body), creating parent dirs. */
async function writeMd(
  relPath: string,
  data: Record<string, unknown>,
  body: string,
) {
  const full = join(CONTENT, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, matter.stringify(`\n${body.trim()}\n`, clean(data)));
}

async function writeRaw(name: string, value: unknown) {
  await mkdir(RAW, { recursive: true });
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
  _embedded?: {
    "wp:featuredmedia"?: { source_url?: string }[];
    "wp:term"?: { name: string; taxonomy: string }[][];
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

/** "/about/" -> "about", "/" -> "index", "/a/b/" -> "a/b" */
function pageFileKey(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "index" : trimmed;
}

async function writePage(p: WpItem) {
  const path = pathOf(p.link);
  await writeMd(
    `pages/${pageFileKey(path)}.md`,
    {
      id: p.id,
      slug: p.slug,
      path,
      title: decodeEntities(p.title.rendered),
      modified: p.modified,
      parent: p.parent || undefined,
      order: p.menu_order || undefined,
      featuredImage: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url,
    },
    p.content.rendered,
  );
}

async function writePost(p: WpItem) {
  const path = pathOf(p.link);
  const terms = (p._embedded?.["wp:term"] ?? []).flat();
  const year = p.date.slice(0, 4);
  await writeMd(
    `posts/${year}/${p.date.slice(0, 10)}-${p.slug}.md`,
    {
      id: p.id,
      slug: p.slug,
      path,
      title: decodeEntities(p.title.rendered),
      date: p.date,
      modified: p.modified,
      excerpt: stripHtml(decodeEntities(p.excerpt.rendered)),
      categories: terms
        .filter((t) => t.taxonomy === "category")
        .map((t) => t.name),
      tags: terms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name),
      featuredImage: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url,
    },
    p.content.rendered,
  );
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
  categories?: { name: string }[];
  image?: { url?: string } | false;
}

async function fetchEvents() {
  const all: TribeEvent[] = [];
  let page = 1;
  let totalPages = 1;
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

/** "/event/foo/2026-07-20/" -> "foo-2026-07-20" (unique per instance). */
function eventFileKey(path: string): string {
  return path
    .replace(/^\/event\//, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");
}

async function writeEvent(e: TribeEvent) {
  const path = pathOf(e.url);
  const venue = !Array.isArray(e.venue) && e.venue ? e.venue : undefined;
  const organizer =
    Array.isArray(e.organizer) && e.organizer.length
      ? (e.organizer[0] as { organizer?: string })
      : undefined;
  const year = e.start_date.slice(0, 4);
  await writeMd(
    `events/${year}/${eventFileKey(path)}.md`,
    {
      id: e.id,
      slug: e.slug,
      path,
      title: decodeEntities(e.title),
      start: e.start_date,
      end: e.end_date,
      allDay: e.all_day,
      timezone: e.timezone,
      cost: e.cost || undefined,
      website: e.website || undefined,
      isVirtual: e.is_virtual,
      virtualUrl: e.virtual_url || undefined,
      venue: venue?.venue
        ? clean({
            name: decodeEntities(venue.venue),
            address: venue.address,
            city: venue.city,
            state: venue.state,
            zip: venue.zip,
          })
        : undefined,
      organizer: organizer?.organizer
        ? decodeEntities(organizer.organizer)
        : undefined,
      categories: (e.categories ?? []).map((c) => c.name),
      image: !e.image ? undefined : e.image.url,
    },
    e.description || "",
  );
}

// ---- main -------------------------------------------------------------------

// Clear the source dirs so a re-sync doesn't leave stale (deleted) items.
for (const dir of ["pages", "posts", "events"]) {
  await rm(join(CONTENT, dir), { recursive: true, force: true });
}

console.log("Fetching pages…");
const pages = await fetchWpType("pages");
for (const p of pages) await writePage(p);

console.log("Fetching posts…");
const posts = await fetchWpType("posts");
for (const p of posts) await writePost(p);

console.log("Fetching events…");
const events = await fetchEvents();

// Multiple recurring-event records can resolve to one public URL; one URL = one
// page. Collapse by path (stable: lowest id wins) so we don't write ambiguous
// duplicate files.
const byPath = new Map<string, TribeEvent>();
for (const e of events) {
  const p = pathOf(e.url);
  const cur = byPath.get(p);
  if (!cur || e.id < cur.id) byPath.set(p, e);
}
const uniqueEvents = [...byPath.values()];
for (const e of uniqueEvents) await writeEvent(e);
const collapsed = events.length - uniqueEvents.length;
if (collapsed) console.log(`  collapsed ${collapsed} duplicate event URLs`);

console.log(
  `\nDone. Wrote ${pages.length} pages, ${posts.length} posts, ` +
    `${uniqueEvents.length} events (of ${events.length} records)` +
    `\nas per-item Markdown under ${CONTENT}\\{pages,posts,events}`,
);
