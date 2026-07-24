/**
 * One-time migration: collapse WordPress's pre-generated recurring-event
 * instance files into single series files with `repeats:` frontmatter
 * (expanded at build by expand-recurring.ts).
 *
 * Detection: files named <slug>-YYYY-MM-DD.md grouped by slug; groups with
 * ≥3 FUTURE instances whose dates fit weekly / biweekly / monthly-nth-weekday
 * (incl. last-of-month) are collapsed. The newest instance is the content
 * template; the earliest future date anchors the series. Future instance
 * files are deleted (replaced by generated instances at the same URLs); past
 * files stay as history. Non-conforming groups are reported and left alone.
 *
 * Usage: bun run scripts/collapse-recurring-events.ts [--dry-run]
 */

import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { Repeats } from "./expand-recurring";

const EVENTS = join(import.meta.dirname, "..", "content", "events");
const DRY = process.argv.includes("--dry-run");
const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 86_400_000;

interface Inst {
  file: string;
  date: string;
}

const entries = (await readdir(EVENTS, { recursive: true })) as string[];
const groups = new Map<string, Inst[]>();
for (const rel of entries.filter((f) => f.endsWith(".md"))) {
  const stemMatch = rel
    .replace(/\\/g, "/")
    .match(/([^/]+)-(\d{4}-\d{2}-\d{2})\.md$/);
  if (!stemMatch) continue;
  (
    groups.get(stemMatch[1]) ?? groups.set(stemMatch[1], []).get(stemMatch[1])!
  ).push({ file: join(EVENTS, rel), date: stemMatch[2] });
}

function inferRule(dates: string[]): Repeats | null {
  const utc = dates.map((d) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  });
  const gaps = utc.slice(1).map((t, i) => (t - utc[i]) / DAY_MS);
  if (gaps.every((g) => g === 7)) return { freq: "weekly", interval: 1 };
  if (gaps.every((g) => g === 14)) return { freq: "weekly", interval: 2 };
  // monthly: same weekday and same nth (or all "last") across instances
  const wd = new Date(utc[0]).getUTCDay();
  if (!utc.every((t) => new Date(t).getUTCDay() === wd)) return null;
  const nths = dates.map((d) => Math.ceil(Number(d.slice(8)) / 7));
  const monthsDistinct = new Set(dates.map((d) => d.slice(0, 7))).size;
  if (monthsDistinct !== dates.length) return null; // >1 per month — not monthly
  if (nths.every((n) => n === nths[0]))
    return { freq: "monthly", byday: `${nths[0]}${WEEKDAYS[wd]}` };
  const isLast = dates.every((d) => {
    const [y, m] = d.split("-").map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return dim - Number(d.slice(8)) < 7;
  });
  if (isLast) return { freq: "monthly", byday: `-1${WEEKDAYS[wd]}` };
  return null;
}

let collapsed = 0;
let deleted = 0;
for (const [slug, insts] of [...groups.entries()].sort()) {
  const future = insts
    .filter((i) => i.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (future.length < 3) continue;
  const rule = inferRule(future.map((i) => i.date));
  if (!rule) {
    console.log(
      `  ~ ${slug}: ${future.length} future instances, no clean rule — left as-is`,
    );
    continue;
  }
  const template = matter(
    await readFile(future[future.length - 1].file, "utf8"),
  );
  const data = template.data as Record<string, unknown>;
  const anchor = future[0].date;
  const timeOf = (s: unknown) => String(s ?? "").slice(10);
  const fm: Record<string, unknown> = {
    ...data,
    id: String(data.id).replace(/-\d{4}-\d{2}-\d{2}$/, ""),
    path: String(data.path ?? "").replace(/\d{4}-\d{2}-\d{2}\/?$/, ""),
    start: anchor + timeOf(data.start),
    end: data.end ? anchor + timeOf(data.end) : undefined,
    repeats: rule,
  };
  if (fm.end === undefined) delete fm.end;
  const out = join(EVENTS, `${slug}.md`);
  console.log(
    `  ✓ ${slug}: ${rule.freq}${rule.interval === 2 ? " (biweekly)" : ""}${rule.byday ? ` ${rule.byday}` : ""}, ` +
      `anchor ${anchor}, collapsing ${future.length} future instances`,
  );
  if (!DRY) {
    await writeFile(
      out,
      matter.stringify(`\n${template.content.trim()}\n`, fm),
    );
    for (const i of future) await unlink(i.file);
  }
  collapsed++;
  deleted += future.length;
}
console.log(
  `collapse-recurring-events${DRY ? " (dry run)" : ""}: ${collapsed} series created, ${deleted} instance files removed`,
);
