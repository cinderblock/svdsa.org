/**
 * Content style linting — shared by the editor Worker (warnings at save) and
 * scripts/lint-content.ts (CLI / CI).
 *
 * Rules live in content/config/style-rules.json — chapter-owned data, not
 * code — so adding a check (an accented place name, an inclusivity rule) is a
 * content edit, not a deploy.
 *
 * Matching is masked: link targets, bare URLs, inline code, and HTML tags are
 * blanked before scanning, so "san-jose" in a slug or URL never trips the
 * "San José" rule. Masking preserves offsets (columns stay true).
 */

export interface StyleRule {
  id: string;
  level: "error" | "warn";
  /** JS regex source (no slashes). */
  pattern: string;
  /** Regex flags; 'g' is added automatically. */
  flags?: string;
  message: string;
  /** Replacement text — enables auto-fix and "did you mean". */
  suggest?: string;
}

export interface LintFinding {
  ruleId: string;
  level: "error" | "warn";
  /** 1-indexed line within the linted text. */
  line: number;
  column: number;
  match: string;
  message: string;
  suggest?: string;
}

/** Blank out regions that prose rules must not match, preserving length. */
function maskLine(line: string): string {
  const blank = (m: string) => " ".repeat(m.length);
  return line
    .replace(/`[^`]*`/g, blank) // inline code
    .replace(/\]\([^)]*\)/g, blank) // markdown link destinations
    .replace(/https?:\/\/\S+/g, blank) // bare URLs
    .replace(/<[^>]*>/g, blank); // HTML tags (attrs, srcs)
}

export function lintText(text: string, rules: StyleRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = text.split("\n");
  let inFence = false;
  lines.forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const line = maskLine(raw);
    for (const rule of rules) {
      let re: RegExp;
      try {
        const flags = rule.flags ?? "";
        re = new RegExp(rule.pattern, flags.includes("g") ? flags : flags + "g");
      } catch {
        continue; // bad pattern in the rules file — skip, don't crash saves
      }
      for (const m of line.matchAll(re)) {
        findings.push({
          ruleId: rule.id,
          level: rule.level,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          match: m[0],
          message: rule.message,
          suggest: rule.suggest,
        });
      }
    }
  });
  return findings;
}

/** Apply every `suggest`-bearing rule to `text` (mask-aware, fence-aware). */
export function fixText(text: string, rules: StyleRule[]): string {
  const fixable = rules.filter((r) => r.suggest !== undefined);
  let inFence = false;
  return text
    .split("\n")
    .map((raw) => {
      if (/^\s*(```|~~~)/.test(raw)) {
        inFence = !inFence;
        return raw;
      }
      if (inFence) return raw;
      const masked = maskLine(raw);
      let out = "";
      let cursor = 0;
      // Rebuild the line, replacing matches found against the MASKED line but
      // splicing into the raw one (offsets are identical by construction).
      const edits: { start: number; end: number; repl: string }[] = [];
      for (const rule of fixable) {
        let re: RegExp;
        try {
          const flags = rule.flags ?? "";
          re = new RegExp(
            rule.pattern,
            flags.includes("g") ? flags : flags + "g",
          );
        } catch {
          continue;
        }
        for (const m of masked.matchAll(re)) {
          edits.push({
            start: m.index ?? 0,
            end: (m.index ?? 0) + m[0].length,
            repl: rule.suggest!,
          });
        }
      }
      edits.sort((a, b) => a.start - b.start);
      for (const e of edits) {
        if (e.start < cursor) continue; // overlapping rules — first wins
        out += raw.slice(cursor, e.start) + e.repl;
        cursor = e.end;
      }
      return out + raw.slice(cursor);
    })
    .join("\n");
}
