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

/**
 * Draft workspace branch: one per (editor, base) — e.g. draft/jane/red.
 * Every save for that base lands here, so multi-file drafts accumulate on ONE
 * branch, preview together on ONE Workers Build, and publish as ONE PR.
 * (Short segments keep the preview alias under the 63-char DNS-label limit.)
 */
export function branchName(editorEmail: string, base: string): string {
  const who = slugify(editorEmail.split("@")[0] || "editor");
  return `draft/${who}/${slugify(base)}`;
}

/** Only allow sane git branch names from user input. */
export function validBranchName(name: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,80}$/.test(name) &&
    !name.includes("..") &&
    !name.endsWith("/") &&
    !name.endsWith(".lock")
  );
}
