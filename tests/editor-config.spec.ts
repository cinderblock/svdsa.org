/**
 * Config files are DATA, not documents.
 *
 * Regression tests for a real corruption bug: `content/config/*.yaml` became
 * editable, but every editable file was assumed to be Markdown. gray-matter
 * found no frontmatter, handed the whole YAML file to the rich-text editor as a
 * body, and a save would have committed remark's idea of it — `#` comment as a
 * heading, `- label:` as bullets, and every bare URL wrapped as `<https://…>`
 * by remark-gfm's autolink literals, breaking every link on the site.
 *
 * `/api/*` is stubbed so these drive the real SPA and assert the exact bytes a
 * save would commit — and, where the Worker normalizes, the real Worker
 * function is applied to the browser's actual payload.
 */

import { test, expect, type Page } from "@playwright/test";
import { EDITOR_URL } from "../playwright.config";
import { serializeMarkdown } from "../editor/src/content/serialize";

const CONFIG_PATH = "content/config/socials.yaml";
const PAGE_PATH = "content/pages/about.md";

/** Real socials.yaml: a comment header, a list, and single-quoted URLs. */
const CONFIG_YAML = `# Social accounts. Shown in the footer and on the contact page.

- label: Instagram
  href: 'https://www.instagram.com/silicon_valley_dsa/'
- label: Bluesky
  href: 'https://bsky.app/profile/siliconvalleydsa.bsky.social'
`;

/** A page body containing a bare URL — the other half of the autolink question. */
const PAGE_BODY =
  "Read the bylaws at https://siliconvalleydsa.org/bylaws/ today.";

type Saved = { text?: string; body?: string; frontmatter?: unknown };

async function mockEditor(page: Page): Promise<Saved> {
  const saved: Saved = {};
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/me", (r) =>
    r.fulfill(json({ email: "e@x", siteOrigin: "https://site.invalid" })),
  );
  await page.route("**/api/branches", (r) =>
    r.fulfill(json({ branches: ["red"] })),
  );
  await page.route("**/api/list*", (r) =>
    r.fulfill(
      json({ base: "red", items: [CONFIG_PATH, PAGE_PATH], nav: null }),
    ),
  );
  await page.route("**/api/status*", (r) =>
    r.fulfill(
      json({
        base: "red",
        draft: "draft/e/red",
        exists: false,
        changed: [],
        pr: null,
      }),
    ),
  );
  await page.route("**/api/meta*", (r) =>
    r.fulfill(
      json({ meta: { [PAGE_PATH]: { title: "About", url: "/about/" } } }),
    ),
  );
  await page.route("**/api/item*", (r) => {
    const path = new URL(r.request().url()).searchParams.get("path");
    const common = {
      path,
      ref: "red",
      base: "red",
      fromDraft: false,
      sha: "abc",
    };
    return r.fulfill(
      json(
        path === CONFIG_PATH
          ? { ...common, kind: "yaml", text: CONFIG_YAML }
          : {
              ...common,
              kind: "markdown",
              frontmatter: { title: "About", path: "/about/" },
              body: PAGE_BODY,
            },
      ),
    );
  });
  await page.route("**/api/save", async (r) => {
    Object.assign(saved, JSON.parse(r.request().postData() ?? "{}"));
    await r.fulfill(
      json({
        branch: "draft/e/red",
        commitSha: "def",
        previewUrl: "https://example.invalid/",
        lint: [],
        autofixed: 0,
      }),
    );
  });
  return saved;
}

/**
 * Open a file the way an editor would: search for it (which expands every
 * group, including the collapsed "Site settings" one), then click the row.
 */
async function open(page: Page, search: string, label: RegExp) {
  await page.goto(EDITOR_URL);
  await page.getByLabel("Search content").fill(search);
  await page.getByRole("button", { name: label }).click();
}

test.describe("editor: chapter config is edited as data", () => {
  test("a YAML file never opens in the rich-text editor", async ({ page }) => {
    await mockEditor(page);
    await open(page, "socials", /socials/);

    // The YAML editor, not Milkdown — and no way to switch to rich text.
    await expect(page.locator(".confignote")).toBeVisible();
    await expect(page.locator(".wysiwyg")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rich text" })).toHaveCount(
      0,
    );

    // A settings file has no title or frontmatter fields to show.
    await expect(page.locator("input.title")).toHaveCount(0);
  });

  test("saving a config file commits it byte-for-byte", async ({ page }) => {
    const saved = await mockEditor(page);
    await open(page, "socials", /socials/);
    // Monaco is lazy-loaded (~1.5 MB), so give it room and wait until it
    // actually holds the document — saving earlier would just echo `initial`
    // and prove nothing about what the editor round-trips.
    await expect(page.locator(".raw")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".raw .view-lines")).toContainText(
      "label: Instagram",
    );

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();

    // The whole point: unchanged bytes, and NOT split into frontmatter+body.
    expect(saved.text).toBe(CONFIG_YAML);
    expect(saved.frontmatter).toBeUndefined();
    expect(saved.body).toBeUndefined();
    // The specific corruption that prompted this: bracket-wrapped URLs.
    expect(saved.text).not.toContain("<https://");
  });

  test("a bare URL in a page body survives the rich-text editor", async ({
    page,
  }) => {
    const saved = await mockEditor(page);
    await open(page, "about", /About/);

    // Wait for Milkdown to actually own the document before saving, or we'd
    // just be asserting on the untouched `initial` string.
    await expect(page.locator(".wysiwyg .ProseMirror")).toContainText(
      "Read the bylaws at",
    );

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator(".msg.ok")).toBeVisible();

    // Milkdown DOES bracket the URL on the way out — that is the upstream
    // behaviour, and this pins it so we notice if it ever changes.
    expect(saved.body).toContain("<https://siliconvalleydsa.org/bylaws/>");

    // What matters is the bytes that reach git. The Worker normalizes on
    // write, so run the browser's actual payload through the real function.
    const committed = serializeMarkdown({ title: "About" }, saved.body!);
    expect(committed).toContain(
      "Read the bylaws at https://siliconvalleydsa.org/bylaws/ today.",
    );
    expect(committed).not.toContain("<https://");
  });
});
