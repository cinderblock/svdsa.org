import type { Config } from "@react-router/dev/config";
import pages from "./content/generated/pages.json";
import posts from "./content/generated/posts.json";
import events from "./content/generated/events-upcoming.json";
import past from "./content/generated/events-past.json";
import series from "./content/generated/events-series.json";

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

// Event pages: every upcoming one-off, plus recurring occurrences inside the
// prerendered window (see PRERENDER_DAYS in scripts/build-content.ts), plus one
// page per recurring SERIES (/event/<slug>/ — "when does this meet?").
// Occurrences beyond the window resolve client-side from the rule via the SPA
// fallback, so no dated URL 404s.
//
// The recent past is prerendered too. The calendar scrolls back into it once
// hydrated, and a link shared last week should still open without JS — these
// are static pages already written, so the only cost is a few dozen files.
const eventPaths = [
  ...(past as { path: string }[]).map((e) => e.path),
  ...(events as { path: string }[]).map((e) => e.path),
  ...(series as { path: string }[]).map((s) => s.path),
];

export default {
  ssr: false,
  prerender: [
    ...new Set([...staticPaths, ...pagePaths, ...postPaths, ...eventPaths]),
  ],
} satisfies Config;
