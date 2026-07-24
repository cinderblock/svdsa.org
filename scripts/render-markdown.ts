/**
 * Markdown → HTML rendering for the site build (build-content.ts).
 *
 * remark + GFM, with rehype-raw so the raw-HTML blocks the migration preserved
 * (scripts, iframes, styled divs/spans) pass through into the output — the same
 * pass-through behavior the old all-HTML bodies had.
 */

import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function renderMarkdown(md: string): Promise<string> {
  return String(await processor.process(md)).trim();
}
