import type { Config } from "@react-router/dev/config";
import pages from "./content/pages.json";
import posts from "./content/posts.json";

// Every path that gets prerendered to static HTML. Preserves the legacy
// WordPress URLs (pages at their own paths, posts at /YYYY/MM/DD/slug/) so old
// links keep resolving. Event detail pages are added in a later phase.
const staticPaths = ["/", "/calendar", "/blog"];

const pagePaths = (pages as { path: string }[])
  .map((p) => p.path)
  .filter((p) => p !== "/" && p !== "/blog/"); // home + blog handled explicitly

const postPaths = (posts as { path: string }[]).map((p) => p.path);

export default {
  ssr: false,
  prerender: [...new Set([...staticPaths, ...pagePaths, ...postPaths])],
} satisfies Config;
