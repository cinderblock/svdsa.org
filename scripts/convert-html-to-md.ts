/**
 * One-time migration: convert content/{pages,posts,events} bodies from the raw
 * WordPress HTML the WP migration stored to real Markdown (so the editor's
 * WYSIWYG edits structure, not raw `<p>` blocks).
 *
 * Frontmatter is preserved BYTE-FOR-BYTE (only the body is replaced), so diffs
 * show pure body conversion. Already-Markdown files are skipped — safe to
 * re-run.
 *
 * Each conversion is verified: the Markdown is rendered back to HTML
 * (render-markdown.ts, same pipeline the site build uses) and its visible text
 * must match the original HTML's visible text (normalized). Mismatches are
 * reported and NOT written unless within tolerance.
 *
 * Usage: bun run scripts/convert-html-to-md.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { htmlToMarkdown, looksLikeHtml } from "./html-to-md";
import { renderMarkdown } from "./render-markdown";

const CONTENT = join(import.meta.dirname, "..", "content");
const DRY = process.argv.includes("--dry-run");

/** Visible-text normalization for before/after comparison. */
function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "") // ignore whitespace/punctuation differences
    .toLowerCase();
}

/** Split a .md file into (frontmatter block incl. fences, body). */
function splitFrontmatter(text: string): { fm: string; body: string } | null {
  const m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
}

let converted = 0;
let skipped = 0;
const failures: string[] = [];

for (const dir of ["pages", "posts", "events"]) {
  const root = join(CONTENT, dir);
  const entries = (await readdir(root, { recursive: true })) as string[];
  for (const rel of entries.filter((f) => f.endsWith(".md")).sort()) {
    const full = join(root, rel);
    const text = await readFile(full, "utf8");
    const parts = splitFrontmatter(text);
    if (!parts) {
      failures.push(`${dir}/${rel}: no frontmatter block`);
      continue;
    }
    const body = parts.body.trim();
    if (!body || !looksLikeHtml(body)) {
      skipped++;
      continue;
    }

    const md = htmlToMarkdown(body);
    const roundTripped = await renderMarkdown(md);
    const before = visibleText(body);
    const after = visibleText(roundTripped);
    if (before !== after) {
      // Tolerate tiny drift (e.g. list marker text), fail on real loss.
      const drift = Math.abs(before.length - after.length);
      if (drift > 20 || !after) {
        failures.push(
          `${dir}/${rel}: text drift ${before.length} → ${after.length} chars`,
        );
        continue;
      }
    }

    if (!DRY) await writeFile(full, `${parts.fm}\n${md}\n`);
    converted++;
  }
}

console.log(
  `convert-html-to-md${DRY ? " (dry run)" : ""}: ${converted} converted, ${skipped} already markdown/empty, ${failures.length} failed`,
);
for (const f of failures) console.log(`  ✗ ${f}`);
if (failures.length) process.exit(1);
