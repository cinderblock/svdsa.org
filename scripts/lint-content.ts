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
import { join } from "node:path";
import yaml from "js-yaml";
import { fixText, lintText, type StyleRule } from "../editor/src/content/lint";

const CONTENT = join(import.meta.dirname, "..", "content");
const FIX = process.argv.includes("--fix");

const rules = yaml.load(
  await readFile(join(CONTENT, "config", "style-rules.yaml"), "utf8"),
) as StyleRule[];

let errors = 0;
let warns = 0;
let fixed = 0;

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
    const findings = lintText(text, rules);
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
    (FIX ? `, ${fixed} file(s) auto-fixed` : ""),
);
if (errors) process.exit(1);
