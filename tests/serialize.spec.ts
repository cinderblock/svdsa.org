/**
 * Markdown write-path normalization (editor/src/content/serialize.ts).
 *
 * The rich-text editor re-serializes bare URLs as `<https://…>` autolinks, so
 * without this every save rewrites every link in the file. Unwrapping is only
 * safe where GFM would linkify the bare form anyway — these tests pin the
 * boundaries (code stays untouched, trimmed punctuation stays bracketed) and
 * are cross-checked against a real GFM parser so "renders the same" is
 * verified rather than asserted.
 */

import { test, expect } from "@playwright/test";
import { remark } from "remark";
import gfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import {
  isConfigPath,
  serializeMarkdown,
  unwrapAutolinks,
} from "../editor/src/content/serialize";

const html = async (md: string) =>
  String(
    await remark().use(gfm).use(remarkRehype).use(rehypeStringify).process(md),
  );

test.describe("unwrapAutolinks", () => {
  test("unwraps a plain bracketed URL", () => {
    expect(unwrapAutolinks("See <https://svdsa.org/join/> now.")).toBe(
      "See https://svdsa.org/join/ now.",
    );
  });

  test("leaves code spans and fenced blocks alone", () => {
    const md = [
      "Use `<https://example.com>` literally.",
      "",
      "```sh",
      "curl <https://example.com>",
      "```",
      "",
      "But <https://example.com> here.",
    ].join("\n");
    const out = unwrapAutolinks(md);
    expect(out).toContain("`<https://example.com>`");
    expect(out).toContain("curl <https://example.com>");
    expect(out).toContain("But https://example.com here.");
  });

  test("keeps brackets when GFM would trim the trailing character", () => {
    // Bare `https://x.org/a.` links only `https://x.org/a` — not the same doc.
    for (const url of [
      "https://x.org/a.",
      "https://x.org/a)",
      "https://x.org/a!",
    ])
      expect(unwrapAutolinks(`Go <${url}> ok`)).toBe(`Go <${url}> ok`);
  });

  test("is idempotent", () => {
    const md = "A <https://a.org/x> and https://b.org/y.";
    expect(unwrapAutolinks(unwrapAutolinks(md))).toBe(unwrapAutolinks(md));
  });

  test("does not change how the document renders", async () => {
    const md = [
      "Read <https://siliconvalleydsa.org/bylaws/> today.",
      "",
      "- <https://a.example/one>",
      "- text before <https://b.example/two> and after",
      "",
      "`<https://code.example>` stays.",
      "",
      "Trailing <https://c.example/x.> stays bracketed.",
    ].join("\n");
    expect(await html(unwrapAutolinks(md))).toBe(await html(md));
  });
});

test.describe("isConfigPath", () => {
  test("matches chapter config, not content", () => {
    expect(isConfigPath("content/config/socials.yaml")).toBe(true);
    expect(isConfigPath("content/config/style-rules.yml")).toBe(true);
    expect(isConfigPath("content/pages/about.md")).toBe(false);
    expect(isConfigPath("content/events/2026/x.md")).toBe(false);
    // Nothing nested — the Worker only knows how to validate flat config.
    expect(isConfigPath("content/config/sub/dir.yaml")).toBe(false);
  });
});

test.describe("serializeMarkdown", () => {
  test("normalizes autolinks written by the rich-text editor", () => {
    const out = serializeMarkdown(
      { title: "About" },
      "Read <https://siliconvalleydsa.org/bylaws/> today.",
    );
    expect(out).toContain("Read https://siliconvalleydsa.org/bylaws/ today.");
    expect(out).not.toContain("<https://");
  });
});
