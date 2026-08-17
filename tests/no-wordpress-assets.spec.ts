/**
 * Nothing in the repo may still point at WordPress.
 *
 * WHY THIS EXISTS AS A TEST, when `wordpress-asset` is already an error-level
 * rule in scripts/lint-content.ts: that linter is not run by any workflow, so
 * it detected the problem and nothing acted on it. A broken Free Store banner
 * shipped to production for days with a green build and green CI. A detector
 * without a gate is not a safeguard.
 *
 * It also came back after being fixed. The images migration rewrote every
 * reference correctly; then `b33aeb0` ("restore the 21 recurring-meeting rules
 * the WXR re-import dropped") took those series' bodies from a pre-rewrite
 * source and resurrected the old URL. So this is a REGRESSION gate first and a
 * migration check second — the failure mode is content being restored from a
 * stale copy, which will happen again.
 *
 * `cleanHtml` strips the siliconvalleydsa.org origin at render, so these become
 * `/wp-content/...` — an address this site does not serve. They are broken the
 * day they land, not the day WordPress is switched off.
 */

import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");

/**
 * Two PDFs the migration never downloaded, so there is nothing in the repo to
 * point them at. They are genuinely broken links today and need the files
 * committed (or the links removed) — listed here so the gate stays meaningful
 * for everything else instead of being switched off.
 */
const KNOWN_UNFIXED = [
  "content/pages/defund-police.md",
  "content/pages/international-solidarity.md",
];

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

test("no content file references a WordPress upload", async () => {
  const offenders: string[] = [];
  for (const rel of await contentFiles()) {
    const text = await readFile(join(ROOT, rel), "utf8");
    for (const m of text.matchAll(/\/wp-content\/[^\s")>]+/g))
      offenders.push(`${rel}  ->  ${m[0]}`);
  }

  const unexpected = offenders.filter(
    (o) => !KNOWN_UNFIXED.some((k) => o.startsWith(k)),
  );
  expect(
    unexpected,
    "These point at WordPress and will 404 on the built site. The file must be " +
      "committed under public/media/ and the reference rewritten to /media/...",
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
