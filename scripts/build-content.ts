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
 * Plus public/sitemap.xml + public/robots.txt.
 *
 * Network-free. Safe to run any time.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { expandSeries } from "./expand-recurring";
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
