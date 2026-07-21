import type { Config } from "@react-router/dev/config";
import pages from "./content/pages.json";
import posts from "./content/posts.json";
import events from "./content/events-upcoming.json";

// Every path that gets prerendered to static HTML. Preserves the legacy
// WordPress URLs (pages at their own paths, posts at /YYYY/MM/DD/slug/, events
// at /event/<slug>/[<date>/]) so old links keep resolving.
const staticPaths = ["/", "/calendar", "/blog"];

const pagePaths = (pages as { path: string }[])
  .map((p) => p.path)
  .filter((p) => p !== "/" && p !== "/blog/"); // home + blog handled explicitly

const postPaths = (posts as { path: string }[]).map((p) => p.path);

// Only upcoming events get detail pages (past events aren't in the slim file).
const eventPaths = (events as { path: string }[]).map((e) => e.path);

export default {
  ssr: false,
  prerender: [
    ...new Set([...staticPaths, ...pagePaths, ...postPaths, ...eventPaths]),
  ],
} satisfies Config;
