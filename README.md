# svdsa.org

A fast, mostly-static rebuild of the [Silicon Valley DSA](https://siliconvalleydsa.org)
chapter website — replacing the WordPress backend with a prerendered React site
that can be hosted cheaply on Cloudflare's free CDN with per-branch previews.

Built on [`ssg-base`](https://github.com/cinderblock/ssg-base) (React Router 7 +
Vite + Bun, prerendered).

**Want to change something on the site?** See **[docs/editing.md](docs/editing.md)**
— one flowchart from "I only want a WYSIWYG" to full git workflows.

## Why

The current site is WordPress + The Events Calendar. Almost none of it needs a
server: pages, blog posts, and even the events calendar are content that changes
infrequently. This rebuild:

- **Ships pure static output** — no runtime dependency on WordPress (or any
  API). WordPress can be retired.
- **Keeps content in the repo** as committed Markdown (`content/`), migrated
  once from the old site.
- **Preserves the old URLs** (pages at their paths, posts at `/YYYY/MM/DD/slug/`)
  so existing links keep working.

## Content pipeline

Content is **one Markdown file per item** (YAML frontmatter + body), committed
to the repo — so adding a post/event is a new file, never an edit to a shared
file (no merge conflicts, no unbounded growth):

```
content/
  posts/<year>/<date>-<slug>.md      # bucketed by publish year
  events/<year>/<path-key>.md         # bucketed by start-date year
  pages/<url-path>.md                 # mirrors the page URL path
```

These files are the **source of truth**. The aggregate JSON the app imports is
a **generated, git-ignored build artifact** (`content/generated/`) — never
hand-edited, never committed, so two people adding content never conflict on a
shared file.

| Script                        | Command                 | What it does                                                                                                                                                          |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/fetch-wp-content.ts` | `bun run migrate`       | One-time / on-demand migration. Pulls WordPress → the per-item Markdown tree above (clears + rewrites the three dirs). Re-run to re-sync until WP is retired.         |
| `scripts/build-content.ts`    | `bun run build:content` | Network-free. Reads the Markdown tree and assembles `content/generated/*.json` (full + slim splits) plus `sitemap.xml`/`robots.txt`. Runs before dev/typecheck/build. |

Data delivery is split for performance:

- **`app/lib/data.ts`** — slim indexes (post metadata + upcoming events) for the
  home, blog, and calendar pages.
- **`app/lib/content.ts`** — full page/post HTML, imported **only** by the
  single-article route so index pages stay light.

### Future dynamic content

If something ever needs to be truly live (e.g. frequently-changing events), the
plan is a Cloudflare Worker + D1 behind the same `data.ts` shape — not a return
to WordPress. The UI is written against the data interfaces, not the source.

## Routes

| Path        | Route                 | Notes                                                             |
| ----------- | --------------------- | ----------------------------------------------------------------- |
| `/`         | `routes/home.tsx`     | Landing: hero, upcoming events, working groups, dispatches        |
| `/calendar` | `routes/calendar.tsx` | Client-side filter + search over upcoming events                  |
| `/blog`     | `routes/blog.tsx`     | Dispatch index                                                    |
| `*`         | `routes/content.tsx`  | Every migrated WP page + post, matched by pathname; 404 otherwise |

All paths are enumerated in `react-router.config.ts` and prerendered to static
HTML at build.

## Getting started

```sh
bun install
bun run dev          # dev server at http://localhost:9999
bun run build        # assemble content + prerender all pages
bun run preview      # preview the built static site
```

Other scripts: `bun run typecheck`, `bun run fmt`, `bun run test`.

Append `?light` to any URL in dev to force light mode.

## Forms & external services

The chapter's interactive bits are already external embeds/links, so the static
site needs no backend for them: **Action Network** (newsletter), **Zeffy** (local
dues / donations), **national DSA** (join), and a **Google Form** (contact).
These are configured in `app/lib/site.ts`.

## Deployment — Cloudflare Workers Static Assets

The site deploys as an **assets-only Worker** (`wrangler.jsonc`): Cloudflare
serves the prerendered `build/client` from its edge. A Worker script (e.g. a
future D1-backed events API) can be added later without changing hosting.

- **Free tier:** static-asset requests are free and unmetered; a static site
  effectively costs nothing.
- **Custom domain:** fully supported on the free plan — add the domain to the
  Worker once DSA's domain is on Cloudflare DNS.

### Local

```sh
bun run build        # -> build/client
bunx wrangler deploy --dry-run   # validate config
bun run cf:dev       # serve the built site via wrangler locally
```

### First-time setup (Cloudflare dashboard — needs the repo on a Git host)

Deploys and **per-branch preview URLs** use **Workers Builds** (the Pages-style
Git integration for Workers):

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → Workers & Pages → Create → **Import a repository**;
   pick this repo.
3. Build command `bun run build`; deploy command `npx wrangler deploy`
   (auto-detected from `wrangler.jsonc`). Production branch `red`.
4. (Optional) set a `SITE_URL` build variable so `sitemap.xml`/`robots.txt`
   use the deployed origin instead of the default production domain.
5. Push to `red` → production; open a PR / push a branch → a preview URL.

`.github/workflows/ci.yml` runs format/typecheck/test/build on every push and
PR (no Cloudflare secrets needed there — Workers Builds does the deploying).

> The default/production branch is **`red`** (chapter theming), not `main`/`master`.
