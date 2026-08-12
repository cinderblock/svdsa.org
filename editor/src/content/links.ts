/**
 * Internal link checking.
 *
 * Dead internal links are the main way a chapter site rots: a page gets renamed
 * or retired and half a dozen others keep pointing at where it used to be. This
 * is the cheap, *deterministic* half of link checking — no network, no
 * flakiness, no rate limits. Every internal link either resolves against the
 * content that exists or it doesn't.
 *
 * Deliberately NOT checked here: external URLs. Those need network calls, go
 * stale on someone else's schedule, and would make a save slow and
 * intermittently wrong. They belong in a scheduled job, not the save path.
 *
 * Findings use the same shape as the style linter so the editor renders them
 * through one code path.
 */

import type { LintFinding } from "./lint";
import { urlForContentPath } from "./urls";

/** Routes the app serves that aren't content files. */
export const STATIC_ROUTES = [
  "/",
  "/blog",
  "/blog/",
  "/calendar",
  "/calendar/",
  "/join/",
  "/donate/",
  "/contact/",
];

/**
 * Build the set of addresses that resolve, from the repo's file list.
 *
 * Also records series slugs, since a recurring event is reachable at
 * `/event/<slug>/<YYYY-MM-DD>/` for any date its rule generates — the exact set
 * isn't knowable from filenames, so those are accepted by shape.
 */
export function knownUrls(contentPaths: string[]): {
  urls: Set<string>;
  eventSlugs: Set<string>;
} {
  const urls = new Set<string>(STATIC_ROUTES);
  const eventSlugs = new Set<string>();
  for (const p of contentPaths) {
    const url = urlForContentPath(p);
    if (!url) continue;
    urls.add(url);
    const ev = url.match(/^\/event\/([^/]+)\/$/);
    if (ev) eventSlugs.add(ev[1]);
  }
  return { urls, eventSlugs };
}

/**
 * Hosts that are really *this* site. The migration wrote internal links as
 * absolute URLs to the live domain (268 of them), so ignoring these as
 * "external" would mean checking almost nothing — the corpus has only 15
 * genuinely relative internal links.
 */
export const SELF_HOSTS = [
  "siliconvalleydsa.org",
  "www.siliconvalleydsa.org",
];

interface FoundLink {
  url: string;
  line: number;
  column: number;
  /** Set when the link was written as an absolute URL to our own domain. */
  absolute?: boolean;
  /**
   * An asset reference (`src=`) rather than a navigation target.
   *
   * These are checked for WordPress dependence but NOT for dead-ness: files in
   * `public/` are real addresses that no content path predicts, so reporting
   * every `/logo.png` as missing would be noise. Verifying those needs the
   * published asset list, which is a separate job.
   */
  asset?: boolean;
}

/**
 * Every internal link target in the text, with position.
 *
 * Covers Markdown destinations and raw HTML `href`s, because ~20 migrated files
 * carry embeds and forms as raw HTML islands and their links rot just the same.
 */
export function extractLinks(text: string): FoundLink[] {
  const out: FoundLink[] = [];
  const lines = text.split(/\r?\n/);
  let inFence = false;

  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const push = (raw: string, index: number, asset = false) => {
      let url = raw.trim().replace(/^<|>$/g, "");
      let absolute = false;

      // An absolute URL pointing at our own domain is an internal link wearing
      // a disguise; unwrap it so it gets checked like any other.
      const self = url.match(/^https?:\/\/([^/]+)(\/[^\s]*)?$/i);
      if (self) {
        if (!SELF_HOSTS.includes(self[1].toLowerCase())) return; // truly external
        url = self[2] || "/";
        absolute = true;
      }

      // Anchors, mail/tel and other schemes are someone else's problem;
      // protocol-relative "//host" is external too.
      if (!url.startsWith("/") || url.startsWith("//")) return;
      out.push({ url, line: i + 1, column: index + 1, absolute, asset });
    };

    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g))
      push(m[1], (m.index ?? 0) + 2);
    for (const m of line.matchAll(/href\s*=\s*["']([^"']+)["']/gi))
      push(m[1], m.index ?? 0);
    // Assets too: the WordPress uploads that die with WordPress live in <img>.
    for (const m of line.matchAll(/src\s*=\s*["']([^"']+)["']/gi))
      push(m[1], m.index ?? 0, true);
  });

  return out;
}

/** Trailing-slash-insensitive membership, since both spellings reach the same page. */
function resolves(
  url: string,
  urls: Set<string>,
  eventSlugs: Set<string>,
): boolean {
  const clean = url.split(/[?#]/)[0];
  if (!clean || clean === "/") return true;
  const withSlash = clean.endsWith("/") ? clean : `${clean}/`;
  const without = clean.replace(/\/$/, "");
  if (urls.has(clean) || urls.has(withSlash) || urls.has(without)) return true;

  // A dated occurrence of a recurring series: /event/<slug>/YYYY-MM-DD/
  const dated = withSlash.match(/^\/event\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/$/);
  if (dated && eventSlugs.has(dated[1])) return true;

  // Feeds and other generated assets live outside the content tree.
  if (/^\/calendar\/[\w/-]+\.ics$/.test(clean)) return true;
  return false;
}

/**
 * Report internal links that don't resolve.
 *
 * `warn`, not `error`: a link may legitimately point at a page being added in
 * the same draft, and blocking a save on that would teach editors to distrust
 * the check. CI is where it can be strict.
 */
export function checkLinks(
  text: string,
  contentPaths: string[],
  extraUrls: string[] = [],
): LintFinding[] {
  const { urls, eventSlugs } = knownUrls(contentPaths);
  for (const u of extraUrls) urls.add(u);

  const seen = new Set<string>();
  const findings: LintFinding[] = [];
  const once = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  for (const link of extractLinks(text)) {
    const { url, line, column } = link;

    /**
     * A WordPress upload — and these are broken RIGHT NOW, not eventually.
     *
     * `cleanHtml` rewrites siliconvalleydsa.org URLs to site-relative before
     * render, so `https://siliconvalleydsa.org/wp-content/uploads/x.png`
     * becomes `/wp-content/uploads/x.png` — an address this static site does
     * not serve. Verified: 18 distinct images across 11 pages of the current
     * build point at nothing.
     *
     * An error, not a warning: it's a visible defect in shipped output. The fix
     * differs from a dead link — the file has to be brought into the repo, not
     * re-pointed.
     */
    if (url.startsWith("/wp-content/")) {
      if (once(`wp:${url}`))
        findings.push({
          ruleId: "wordpress-asset",
          level: "error",
          line,
          column,
          match: url,
          message:
            `Broken image: nothing serves ${url}. It's still a WordPress ` +
            `upload — the file has to be committed to the repo.`,
        });
      continue;
    }

    // Assets are only checked for WordPress dependence (see FoundLink.asset).
    if (link.asset) continue;

    if (!resolves(url, urls, eventSlugs)) {
      // One finding per distinct target: repeating the same dead link six times
      // buries everything else.
      if (once(`dead:${url}`))
        findings.push({
          ruleId: "dead-internal-link",
          level: "warn",
          line,
          column,
          match: url,
          message: `Nothing on the site answers ${url}`,
        });
      continue;
    }

    /**
     * A resolving absolute self-link is deliberately NOT reported.
     *
     * An earlier version flagged all 86 of them, claiming they'd leave a branch
     * preview for the live domain. That was wrong: `cleanHtml` (app/lib/html.ts)
     * strips the siliconvalleydsa.org origin before render, and the built output
     * contains zero of them — checked. So the renderer already handles it, and
     * 86 warnings about a non-problem would only teach editors to ignore the
     * panel.
     *
     * Unwrapping them in extractLinks still matters: it's the only way the dead
     * ones get noticed, since the corpus writes almost every internal link this
     * way.
     */
  }
  return findings;
}
