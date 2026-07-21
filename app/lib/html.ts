/**
 * HTML cleanup for rendered WordPress content. Kept dependency-free (no data
 * imports) so components like Prose can use it without pulling in the full
 * pages/posts JSON.
 *
 * Prepares migrated WordPress HTML for display:
 *  - rewrite absolute siliconvalleydsa.org links to site-relative (so the
 *    static site is self-contained and old internal links keep working),
 *  - strip `title=` attributes (never use hover-only tooltips).
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/https?:\/\/(www\.)?siliconvalleydsa\.org/g, "")
    .replace(/\s+title="[^"]*"/g, "")
    .replace(/\s+title='[^']*'/g, "");
}
