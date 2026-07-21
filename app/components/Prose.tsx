import { cleanHtml } from "~/lib/content";

/** Renders migrated WordPress HTML, cleaned (relative links, no title= attrs). */
export function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: cleanHtml(html) }}
    />
  );
}
