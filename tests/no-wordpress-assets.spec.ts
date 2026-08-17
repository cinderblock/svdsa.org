/**
 * Nothing in the repo may still point at OUR WordPress uploads.
 *
 * WHY THIS EXISTS AS A TEST, when `wordpress-asset` is already an error-level
 * rule in the content linter: that linter is not run by any workflow, so it
 * detected the problem and nothing acted on it. A broken Free Store banner
 * shipped to production with a green build and green CI. A detector without a
 * gate is not a safeguard.
 *
 * It also came back after being fixed. The images migration rewrote all 50
 * references correctly; then `b33aeb0` ("restore the 21 recurring-meeting rules
 * the WXR re-import dropped") took those series' bodies from a pre-rewrite
 * source and resurrected the old URL. So this is a REGRESSION gate first and a
 * migration check second — the failure mode is content restored from a stale
 * copy, which will happen again.
 *
 * `cleanHtml` strips the siliconvalleydsa.org origin at render, so our own
 * uploads resolve to `/wp-content/...` — an address this site does not serve.
 * They are broken the day they land, not the day WordPress is switched off.
 *
 * It delegates to `checkLinks` rather than grepping for "wp-content", which is
 * the mistake that produced this file's first version: a plain text search also
 * matches OTHER organisations' WordPress sites (csh.org, sccdp.org appear in
 * citations here), and those links are fine. One definition of "ours", shared
 * with the linter and the editor, is the only way that stays true.
 */

import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { checkLinks } from "../editor/src/content/links";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");

async function contentFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of ["pages", "posts", "events"]) {
    const entries = (await readdir(join(CONTENT, dir), {
      recursive: true,
    })) as string[];
    for (const rel of entries.filter((f) => f.endsWith(".md")))
      out.push(`content/${dir}/${rel.split(sep).join("/")}`);
  }
  return out;
}

test("no content file references one of our WordPress uploads", async () => {
  const all = await contentFiles();
  const offenders: string[] = [];
  for (const rel of all) {
    const text = await readFile(join(ROOT, rel), "utf8");
    for (const f of checkLinks(text, all))
      if (f.ruleId === "wordpress-asset")
        offenders.push(`${rel}  ->  ${f.match}`);
  }
  expect(
    offenders,
    "These resolve to /wp-content/... which the built site does not serve. " +
      "Commit the file under public/media/ and rewrite the reference to /media/...",
  ).toEqual([]);
});

test("every /media/ reference resolves to a committed file", async () => {
  // The other half of the same promise: rewriting a URL to /media/ is only a
  // fix if the file is actually there.
  const missing: string[] = [];
  for (const rel of await contentFiles()) {
    const text = await readFile(join(ROOT, rel), "utf8");
    for (const m of text.matchAll(/\/media\/[^\s")>]+/g)) {
      const asset = join(ROOT, "public", m[0].split("/").join(sep));
      try {
        await readFile(asset);
      } catch {
        missing.push(`${rel}  ->  ${m[0]}`);
      }
    }
  }
  expect(missing, "referenced but not committed under public/media/").toEqual(
    [],
  );
});
