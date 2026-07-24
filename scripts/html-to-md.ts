/**
 * WordPress-HTML → Markdown conversion (shared by the one-time content
 * migration and future fetch-wp-content pulls).
 *
 * Output style matches what the editor's WYSIWYG (Milkdown ⇒ remark-stringify)
 * emits — atx headings, `*` bullets/emphasis, fenced code — so editor
 * round-trips produce minimal diffs.
 *
 * Things Markdown can't express are preserved as raw HTML blocks, byte-for-byte
 * (scripts, iframes, forms, functional divs/spans with style). The site build
 * renders Markdown → HTML with rehype-raw, so those blocks pass through.
 */

import TurndownService from "turndown";

/** Blocks to preserve verbatim. Extracted BEFORE turndown so its blank-element
 * rule can't drop empty-but-functional nodes (e.g. the ActionNetwork target
 * div). None of these nest within themselves in our corpus. */
const RAW_BLOCK_PATTERNS: RegExp[] = [
  /<script\b[\s\S]*?<\/script>/gi,
  /<style\b[\s\S]*?<\/style>/gi,
  /<iframe\b[\s\S]*?<\/iframe>/gi,
  /<form\b[\s\S]*?<\/form>/gi,
  // Empty-or-comment-only divs that exist as JS targets / spacers.
  /<div [^>]*>\s*(?:<!--[\s\S]*?-->)?\s*<\/div>/gi,
];

/** WP editor junk that should not survive migration at all. */
const JUNK_PATTERNS: RegExp[] = [
  // TinyMCE selection bookmarks (invisible spans around embedded scripts).
  /<span[^>]*class="[^"]*mce_SELRES_[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
];

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "*",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });

  // WP caption blocks → image + emphasized caption paragraph.
  td.addRule("wpCaption", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      /(^|\s)wp-caption(\s|$)/.test(node.getAttribute("class") ?? ""),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const img = el.querySelector("img");
      const src = img?.getAttribute("src") ?? "";
      const alt = (img?.getAttribute("alt") ?? "").replace(/[[\]]/g, "");
      const caption = el.querySelector(".wp-caption-text")?.textContent?.trim();
      if (!src) return caption ? `\n\n*${caption}*\n\n` : "";
      return `\n\n![${alt}](${src})\n\n${caption ? `*${caption}*\n\n` : ""}`;
    },
  });

  // Spans styled to normal weight are WP paste noise — unwrap.
  td.addRule("unwrapNoopSpan", {
    filter: (node) =>
      node.nodeName === "SPAN" &&
      /^font-weight:\s*400;?\s*$/.test(node.getAttribute("style") ?? ""),
    replacement: (content) => content,
  });

  // Divs/spans with inline style carry meaning Markdown can't (layout, color,
  // size, underline) — keep them as raw HTML. Plain wrappers unwrap by default.
  td.keep(
    (node) =>
      (node.nodeName === "DIV" || node.nodeName === "SPAN") &&
      node.getAttribute("style") !== null,
  );

  return td;
}

const td = createTurndown();

export function htmlToMarkdown(html: string): string {
  let src = html;
  for (const re of JUNK_PATTERNS) src = src.replace(re, "");

  // Pull raw blocks out behind alphanumeric tokens turndown will pass through.
  const raw: string[] = [];
  for (const re of RAW_BLOCK_PATTERNS) {
    src = src.replace(re, (m) => {
      raw.push(m);
      return `RAWHTMLBLOCK${raw.length - 1}X`;
    });
  }

  let md = td.turndown(src);

  md = md.replace(/RAWHTMLBLOCK(\d+)X/g, (_m, i) => raw[Number(i)] ?? "");
  // Collapse the 3+ blank lines that block removals can leave behind.
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

/** Heuristic: is this body still migrated WP HTML (vs already Markdown)? */
export function looksLikeHtml(body: string): boolean {
  return /^\s*<(p|div|h[1-6]|ul|ol|figure|blockquote|table|a|img|script|iframe|span|em|strong|b|i)\b/i.test(
    body,
  );
}
