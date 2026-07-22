/**
 * Content (de)serialization — the shared, host-independent core.
 *
 * Round-trips the exact on-disk format the site build reads: YAML frontmatter +
 * body, via gray-matter, matching what scripts/fetch-wp-content.ts produced
 * (body wrapped in blank lines). The editor reads/writes this `.md` source,
 * never content/generated/*.json.
 */

import matter from "gray-matter";

export interface Parsed {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseMarkdown(raw: string): Parsed {
  const p = matter(raw);
  return { frontmatter: p.data as Record<string, unknown>, body: p.content.trim() };
}

export function serializeMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  // Match the migration's formatting: a blank line around the body.
  return matter.stringify(`\n${body.trim()}\n`, frontmatter);
}

/** URL/branch-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Draft branch for an editor + content path, e.g. draft/jane/posts-2026-….  */
export function branchName(editorEmail: string, itemPath: string): string {
  const who = slugify(editorEmail.split("@")[0] || "editor");
  const what = slugify(itemPath.replace(/^content\//, "").replace(/\.md$/, ""));
  return `draft/${who}/${what}`;
}
