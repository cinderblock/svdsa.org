/**
 * The URL a content file will have on the site — the inverse of the naming
 * conventions in `newItem.ts`, derived from the filename alone.
 *
 * That it works from the filename with no frontmatter is what makes link
 * checking cheap: the Worker already has the file list, so it can build the set
 * of valid addresses without reading a thousand files. It is also why this file
 * is deliberately dependency-free — the BROWSER imports it too, to group the
 * file list by URL before any metadata has loaded.
 *
 * The tree mirrors the URL, with one exception that cannot be derived and so has
 * to be written down: the home page is `content/pages/home.md` and serves `/`,
 * not `/home/`. Until this was in one place, the file list and the `?url=` deep
 * link each worked it out from the filename and so agreed with each other about
 * an address that does not exist — which is why the home page fell out of "Main
 * pages" into the collapsed "Other pages" group, and why `?url=/` never
 * resolved. Link checking had the same blind spot in the other direction: `/`
 * looked broken and `/home/` looked valid.
 */

/** The one content file whose name doesn't match its address. */
export const HOME_PATH = "content/pages/home.md";

/**
 * Returns null for anything without a public URL (config, drafts we can't see
 * from the path).
 */
export function urlForContentPath(path: string): string | null {
  if (path === HOME_PATH) return "/";

  const page = path.match(/^content\/pages\/(.+)\.md$/);
  if (page) return `/${page[1]}/`;

  const post = path.match(
    /^content\/posts\/\d{4}\/(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/,
  );
  if (post) return `/${post[1]}/${post[2]}/${post[3]}/${post[4]}/`;

  // Both a top-level series and a year-bucketed one-off address as /event/<slug>/.
  const event = path.match(/^content\/events\/(?:\d{4}\/)?([^/]+)\.md$/);
  if (event) return `/event/${event[1]}/`;

  return null;
}
