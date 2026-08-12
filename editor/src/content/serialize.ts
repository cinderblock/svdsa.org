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

/**
 * Trailing characters GFM strips off a bare autolink literal. `<https://x/f.>`
 * links the dot; `https://x/f.` does not — so those must stay bracketed.
 */
const TRIMMED_TAIL = /[.,;:!?*_~'")\]]$/;

/**
 * Unwrap `<https://…>` back to a bare URL, outside of code.
 *
 * Milkdown's serializer (remark-gfm's autolink-literal extension) re-emits
 * every bare URL as a bracketed autolink, so merely OPENING a page in the
 * rich-text editor and saving it rewrites every link in the file. It renders
 * identically, so this is pure diff noise — and noise that buries the actual
 * edit in a PR review. Normalize it away on write.
 *
 * Only touches URLs GFM would linkify bare anyway: code spans and fenced blocks
 * are skipped, and URLs ending in punctuation GFM would trim are left alone.
 */
export function unwrapAutolinks(md: string): string {
  const unwrap = (s: string) =>
    s.replace(/<(https?:\/\/[^\s<>]+)>/g, (whole, url: string) =>
      TRIMMED_TAIL.test(url) ? whole : url,
    );
  // Split on fenced blocks, then on inline code, and rewrite only the gaps.
  return md
    .split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)[^\n]*$)/gm)
    .map((chunk, i) =>
      i % 2
        ? chunk
        : chunk
            .split(/(`+[^`]*`+)/g)
            .map((piece, j) => (j % 2 ? piece : unwrap(piece)))
            .join(""),
    )
    .join("");
}

export function serializeMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  // Match the migration's formatting: a blank line around the body.
  return matter.stringify(`\n${unwrapAutolinks(body.trim())}\n`, frontmatter);
}

/**
 * Chapter config (menus, socials, style rules) is **data, not a document**, and
 * must never touch the Markdown path above.
 *
 * gray-matter finds no `---` frontmatter in a plain YAML file, so it returns
 * `{}` and hands the WHOLE file back as `body` — which the rich-text editor
 * then treats as Markdown. Round-tripping `socials.yaml` that way turns the
 * leading `#` comment into a heading, `- label:` into bullets, and (via
 * remark-gfm's autolink literals) every bare URL into `<https://…>`, so a save
 * would commit `href: '<https://…>'` and break every link on the site.
 *
 * Config therefore gets a text editor and a YAML parse check, never the
 * frontmatter+body split. See `isConfigItem` in the Worker.
 */
export function isConfigPath(path: string): boolean {
  return /^content\/config\/[^/]+\.ya?ml$/.test(path);
}

/**
 * Everything the editor may read OR write: chapter content and configuration.
 *
 * This is the Worker's write boundary, not a display filter. The editor commits
 * as a trusted GitHub App, so an unconstrained `path` in a save request means
 * any file in the repository — `.github/workflows/*` included. It only ever
 * lands on a `draft/` branch and publishing goes through a PR, but that is one
 * careless merge away from being someone else's problem.
 *
 * Deliberately excludes `..` and absolute paths by construction (the pattern is
 * anchored and every segment is explicit).
 */
export function isEditablePath(path: string): boolean {
  return /^content\/(?:(?:pages|posts|events)\/[^\s]+\.md|config\/[^/]+\.ya?ml)$/.test(
    path,
  ) && !path.includes("..");
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
