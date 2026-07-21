/**
 * Typed accessors over the committed content in `content/`.
 *
 * Everything here is local, static data — no network at build or runtime.
 * pages.json / posts.json carry full article HTML, so this module is imported
 * ONLY by the content route (single page/post view). Index pages use the slim
 * data.ts instead. The 1.8 MB events.json is never imported anywhere.
 */

import pagesData from "../../content/pages.json";
import postsData from "../../content/posts.json";

export interface Page {
  id: number;
  slug: string;
  path: string;
  title: string;
  html: string;
  excerpt: string;
  parent: number;
  order: number;
  modified: string;
  featuredImage: string | null;
}

export interface Post {
  id: number;
  slug: string;
  path: string;
  title: string;
  date: string;
  modified: string;
  html: string;
  excerpt: string;
  categories: string[];
  tags: string[];
  featuredImage: string | null;
}

export const pages = pagesData as Page[];
export const posts = postsData as Post[];

const normalize = (p: string) => (p.endsWith("/") ? p : p + "/");

export function getPage(pathname: string): Page | undefined {
  const want = normalize(pathname);
  return pages.find((p) => normalize(p.path) === want);
}

export function getPost(pathname: string): Post | undefined {
  const want = normalize(pathname);
  return posts.find((p) => normalize(p.path) === want);
}

/**
 * Prepare rendered WordPress HTML for display:
 *  - rewrite absolute siliconvalleydsa.org links to site-relative (so the
 *    static site is self-contained and old internal links keep working),
 *  - strip `title=` attributes (never use hover-only tooltips),
 *  - drop the legacy "Read more »" excerpt tails.
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/https?:\/\/(www\.)?siliconvalleydsa\.org/g, "")
    .replace(/\s+title="[^"]*"/g, "")
    .replace(/\s+title='[^']*'/g, "");
}
