import type { Config } from "@react-router/dev/config";
import pages from "./content/generated/pages.json";
import posts from "./content/generated/posts.json";
import events from "./content/generated/events-upcoming.json";

// Every path that gets prerendered to static HTML. Preserves the legacy
// WordPress URLs (pages at their own paths, posts at /YYYY/MM/DD/slug/, events
// at /event/<slug>/[<date>/]) so old links keep resolving.
const staticPaths = [
  "/",
  "/calendar",
  "/blog",
  "/join/",
  "/donate/",
  "/contact/",
];

// Paths that have their own purpose-built routes instead of the WP-page splat.
const OVERRIDDEN = new Set(["/", "/blog/", "/join/", "/donate/", "/contact/"]);

const pagePaths = (pages as { path: string }[])
  .map((p) => p.path)
  .filter((p) => !OVERRIDDEN.has(p));

const postPaths = (posts as { path: string }[]).map((p) => p.path);

// Only upcoming events get detail pages (past events aren't in the slim file).
const eventPaths = (events as { path: string }[]).map((e) => e.path);

export default {
  ssr: false,
  prerender: [
    ...new Set([...staticPaths, ...pagePaths, ...postPaths, ...eventPaths]),
  ],
} satisfies Config;
