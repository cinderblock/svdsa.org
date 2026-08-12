/**
 * Content style linter (CLI / CI). Rules: content/config/style-rules.json;
 * engine shared with the editor Worker (editor/src/content/lint.ts), which
 * surfaces the same findings at save time.
 *
 * Usage:
 *   bun run lint:content          report findings; exit 1 if any "error" level
 *   bun run lint:content --fix    apply `suggest` replacements, then report
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import yaml from "js-yaml";
import { fixText, lintText, type StyleRule } from "../editor/src/content/lint";
import { checkLinks } from "../editor/src/content/links";

const CONTENT = join(import.meta.dirname, "..", "content");
const FIX = process.argv.includes("--fix");

const rules = yaml.load(
  await readFile(join(CONTENT, "config", "style-rules.yaml"), "utf8"),
) as StyleRule[];

/**
 * The chapter's event-category vocabulary. Enforced here because nothing else
 * did: `categories` is free text, and an unknown value used to sail through and
 * merely get a hashed colour — while quietly dropping out of the calendar's
 * facet filters and its own subscription feed. A typo was invisible.
 */
const allowedCategories = new Set(
  (
    yaml.load(
      await readFile(join(CONTENT, "config", "event-categories.yaml"), "utf8"),
    ) as { categories: { label: string }[] }
  ).categories.map((c) => c.label.toLowerCase()),
);

let errors = 0;
let warns = 0;
let fixed = 0;
let badCategories = 0;

/** Frontmatter block of a content file, unparsed. */
const frontmatterOf = (text: string) =>
  text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";

function checkCategories(rel: string, text: string): void {
  const fm = yaml.load(frontmatterOf(text)) as
    | { categories?: unknown }
    | undefined;
  const cats = fm?.categories;
  if (!Array.isArray(cats)) return;
  for (const c of cats) {
    if (typeof c !== "string" || allowedCategories.has(c.toLowerCase()))
      continue;
    console.log(
      `✗ ${rel} [event-category] "${c}" is not in the chapter's vocabulary ` +
        `— add it to content/config/event-categories.yaml or use an existing one`,
    );
    badCategories++;
    errors++;
  }
}

/**
 * Every content path, for link checking — the checker needs to know what exists
 * before it can say what doesn't.
 */
const allPaths: string[] = [];
for (const dir of ["pages", "posts", "events"]) {
  const entries = (await readdir(join(CONTENT, dir), {
    recursive: true,
  })) as string[];
  for (const rel of entries.filter((f) => f.endsWith(".md")))
    // readdir yields OS separators on Windows; repo paths are always forward.
    allPaths.push(`content/${dir}/${rel.split(sep).join("/")}`);
}

for (const dir of ["pages", "posts", "events"]) {
  const root = join(CONTENT, dir);
  const entries = (await readdir(root, { recursive: true })) as string[];
  for (const rel of entries.filter((f) => f.endsWith(".md")).sort()) {
    const full = join(root, rel);
    let text = await readFile(full, "utf8");
    if (FIX) {
      const next = fixText(text, rules);
      if (next !== text) {
        await writeFile(full, next);
        text = next;
        fixed++;
      }
    }
    if (dir === "events") checkCategories(`${dir}/${rel}`, text);
    const findings = [...lintText(text, rules), ...checkLinks(text, allPaths)];
    for (const f of findings) {
      const tag = f.level === "error" ? "✗" : "⚠";
      console.log(
        `${tag} ${dir}/${rel}:${f.line}:${f.column} [${f.ruleId}] ${f.message}` +
          (f.suggest !== undefined ? ` — "${f.match}" → "${f.suggest}"` : ""),
      );
      if (f.level === "error") errors++;
      else warns++;
    }
  }
}

console.log(
  `lint-content: ${errors} error(s), ${warns} warning(s)` +
    (badCategories ? `, ${badCategories} unknown categor(y/ies)` : "") +
    (FIX ? `, ${fixed} file(s) auto-fixed` : ""),
);
if (errors) process.exit(1);
