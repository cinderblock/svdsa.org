/**
 * Live preview — what a member will actually see.
 *
 * This is NOT what the WYSIWYG shows. Milkdown shows document *structure* in
 * Milkdown's own theme: not the site's fonts, spacing, colours or components,
 * and the raw-HTML islands the migration preserved (embeds, forms, styled divs)
 * don't render there the way they do live.
 *
 * Fidelity comes from reusing the site's real pipeline rather than a lookalike:
 *
 *   renderMarkdown  scripts/render-markdown.ts — remark + GFM + rehype-raw,
 *                   the exact processor build-content.ts runs
 *   cleanHtml       app/lib/html.ts — rewrites absolute svdsa.org links to
 *                   site-relative and strips title= attributes
 *   .prose          the same class app/components/Prose.tsx renders into
 *
 * Imported by relative path, so there is one pipeline and it cannot drift. If
 * the site's rendering changes, this changes with it.
 *
 * Rendered into an IFRAME for two reasons: the site's stylesheet would otherwise
 * fight the editor's own, and a `<base href>` pointing at the live origin makes
 * fonts, images and relative links resolve exactly as they do on the real page.
 * That includes resolving to *nothing* where the page is genuinely broken —
 * a WordPress upload shows as a broken image here, because that's what a reader
 * gets today.
 */

import { useEffect, useMemo, useRef, useState } from "react";
// The site's own stylesheet, as text — `?inline` keeps Vite from injecting it
// into the editor's document, where it would collide with the editor's styles.
import siteCss from "../../../app/styles/global.css?inline";
import { cleanHtml } from "../../../app/lib/html";
import { renderMarkdown } from "../../../scripts/render-markdown";

/** Debounce so a fast typist isn't re-running remark on every keystroke. */
const DEBOUNCE_MS = 250;

export function Preview({
  /** Current Markdown body. */
  body: markdown,
  /** Live site origin, so assets and links resolve as they do in production. */
  siteOrigin,
  title,
}: {
  body: string;
  siteOrigin: string;
  title?: string;
}) {
  const [html, setHtml] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(() => {
      renderMarkdown(markdown)
        .then((out) => {
          // A slower earlier render must not overwrite a newer one.
          if (seq.current === mine) {
            setHtml(cleanHtml(out));
            setFailed(null);
          }
        })
        .catch((e) => {
          if (seq.current === mine) setFailed((e as Error).message);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [markdown]);

  const doc = useMemo(
    () =>
      [
        "<!doctype html><html><head><meta charset='utf-8'>",
        // Assets and relative links resolve against the real site.
        siteOrigin ? `<base href="${siteOrigin}/">` : "",
        `<style>${siteCss}</style>`,
        // The preview is not interactive: a stray click shouldn't navigate the
        // iframe away from the document being edited.
        "<style>body{margin:0;padding:1.5rem 0}a{cursor:default}</style>",
        "</head><body>",
        '<main class="container">',
        title ? `<h1>${escapeHtml(title)}</h1>` : "",
        `<div class="prose">${html}</div>`,
        "</main></body></html>",
      ].join(""),
    [html, siteOrigin, title],
  );

  if (failed)
    return <p className="msg err">✗ Couldn&rsquo;t render this: {failed}</p>;

  return (
    <iframe
      className="preview"
      title="Preview of this page as members will see it"
      // No allow-same-origin: the preview must not be able to reach back into
      // the editor. allow-scripts is omitted too, so embedded <script> islands
      // stay inert — they'd show as blank in the preview, which is honest for a
      // static render.
      sandbox=""
      srcDoc={doc}
    />
  );
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
