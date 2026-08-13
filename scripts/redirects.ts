/**
 * Turn the chapter's redirect list into Cloudflare's `_redirects` format.
 *
 * "Old URLs keep working" is a founding premise of the rebuild, so the checks
 * here fail the BUILD rather than shipping a broken promise. A rule that
 * silently never matches is worse than no rule at all: it looks like it worked.
 *
 * Cloudflare's static-asset router reads `_redirects` from the deployed output
 * and answers a real 301 at the edge — no JS, no meta-refresh, no 200-then-hop.
 * Verified against `wrangler dev`, not assumed.
 */

export interface RedirectRule {
  from?: string;
  to?: string;
  /** Optional note, for whoever reads this in a year. */
  why?: string;
}

export class BadRedirect extends Error {}

export function renderRedirects(rules: RedirectRule[]): string {
  const froms = new Set<string>();
  const lines: string[] = [];

  for (const r of rules) {
    const from = (r.from ?? "").trim();
    const to = (r.to ?? "").trim();
    if (!from.startsWith("/") || !to.startsWith("/"))
      throw new BadRedirect(
        `from/to must be site-absolute paths — got ` +
          `${from || "(empty)"} → ${to || "(empty)"}`,
      );
    if (from === to) throw new BadRedirect(`${from} redirects to itself`);
    if (froms.has(from))
      throw new BadRedirect(`${from} is redirected more than once`);
    froms.add(from);
    if (r.why) lines.push(`# ${r.why}`);
    lines.push(`${from} ${to} 301`);
  }

  // A target that is itself a redirect source costs readers two hops and can
  // loop. Checked after collecting every source, so order in the file is
  // irrelevant.
  for (const r of rules) {
    const to = (r.to ?? "").trim();
    if (froms.has(to))
      throw new BadRedirect(
        `${r.from} → ${to}, but ${to} is itself redirected — ` +
          `point it at the final address`,
      );
  }

  return lines.length
    ? `# Generated from content/config/redirects.yaml — do not edit.\n${lines.join("\n")}\n`
    : "";
}
