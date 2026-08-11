# svdsa.org

A fast, mostly-static rebuild of the [Silicon Valley DSA](https://siliconvalleydsa.org)
chapter website — replacing the WordPress backend with a prerendered React site
that can be hosted cheaply on Cloudflare's free CDN with per-branch previews.

Built on [`ssg-base`](https://github.com/cinderblock/ssg-base) (React Router 7 +
Vite + Bun, prerendered).

**Want to change something on the site?** See **[docs/editing.md](docs/editing.md)**
— one flowchart from "I only want a WYSIWYG" to full git workflows.

**Looking for what's outstanding?** **[TODO.md](TODO.md)** — every open item in
one list, each pointing at the plan doc that holds the detail.

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
  events/<slug>.md                    # RECURRING series (recurrence: rule — see below)
  events/<year>/<slug>-<date>.md      # one-off / irregular instances, bucketed by year
  pages/<url-path>.md                 # mirrors the page URL path
  config/*.yaml                       # chapter config: menus, socials, style rules
```

Bodies are **Markdown** (things Markdown can't express — embeds, forms — are
raw HTML islands, rendered via rehype-raw).

**Config is YAML, not JSON**, because people read and edit it: it takes comments
and doesn't punish a trailing comma. `build-content.ts` parses it and emits
`content/generated/config/*.json`, which is what the app imports — so YAML never
reaches the browser bundle and the imports stay typed. JSON in this repo is
always a generated artifact, never something you hand-edit.

### Link checking

`editor/src/content/links.ts` checks internal links against the content that
actually exists — on every save and in `bun run lint:content`. Deliberately
**no network**: external URLs go stale on someone else's schedule and would make
saving slow and intermittently wrong, so they belong in a scheduled job.

The corpus taught this check its most important lesson. It has only ~15
genuinely relative internal links — the WordPress migration wrote the rest as
**absolute URLs to the live domain**. A checker that dismissed those as
"external" would have reported a clean bill of health. Treating same-host
absolutes as internal turns up two real problems:

| Finding              | Level | Count | What it is                                                                                                                |
| -------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `wordpress-asset`    | error | 58    | `/wp-content/uploads/…` images that **are broken in the current build** — 18 distinct files across 11 pages serve nothing |
| `dead-internal-link` | warn  | 91    | `/events/` (the old WP calendar), `/donations/` (the site has `/donate/`), and pre-2025 events the migration didn't carry |

A dead link is a **warning**, because a draft may legitimately link to a page it
adds in the same change and blocking a save on that teaches editors to distrust
the check. A WordPress upload is an **error**: it's a visible defect in shipped
output, not a future risk. `cleanHtml` strips the `siliconvalleydsa.org` origin
before render, so those URLs resolve to `/wp-content/…` — an address this site
does not serve. The file has to be committed to the repo.

Asset references (`src=`) are checked for WordPress dependence but not for
dead-ness, since files in `public/` are real addresses no content path predicts.

**A resolving absolute self-link is deliberately not reported.** An earlier
version flagged all 86, claiming they'd leave a branch preview for the live
domain — wrong: `cleanHtml` rewrites them and the built output contains zero.
Unwrapping them in the extractor still matters, since it's the only way the dead
ones become visible.

### Redirects — old addresses keep working

Preserving the old URLs is a founding premise here, so renaming is never just a
move. `content/config/redirects.yaml` is the chapter's list of promises;
`build-content.ts` renders it to `public/_redirects`, which Cloudflare's
static-asset router serves as a **real 301 at the edge** — no JS, no
meta-refresh, no 200-then-hop. Confirmed against `wrangler dev`:

```
$ curl -sI http://127.0.0.1:8799/old-housing-page/
HTTP 301   Location: /housing/
```

`scripts/redirects.ts` **fails the build** rather than shipping a rule that
can't work: a relative path (silently never matches), a self-redirect, a
duplicated source, or a chain (`/a/`→`/b/`→`/c/`, which costs two hops and can
loop). The editor appends to this file automatically on rename, so an address
already out in the world can't be quietly broken — and it skips the entry when
the old address was never published, rather than accruing promises about URLs
nobody ever had.

### Recurring events

A repeating meeting is **one file** carrying an iCalendar recurrence rule.
Occurrences are **derived**, never stored:

```yaml
recurrence:
  rrule: FREQ=MONTHLY;BYDAY=3SA # 3rd Saturday
  exdate: ["2026-12-19"] # ...except this one
  rdate: ["2026-12-12"] # ...which moved here
```

`app/lib/recurrence.ts` is the single engine, shared by the build, the browser
and the `.ics` feeds. Consequences worth knowing:

- **The calendar can't go stale.** The browser expands the rules against the
  reader's own clock, so a site that hasn't been rebuilt in months still lists
  correct upcoming dates. A scheduled rebuild is a freshness optimization, not a
  correctness requirement.
- The build prerenders a bounded window (`PRERENDER_DAYS`, 90) of dated
  occurrence pages plus one page per series; dated URLs beyond the window render
  client-side from the rule, so no `/event/<slug>/<date>/` link 404s.
- `EXDATE`/`RDATE` express holiday skips and reschedules — several working
  groups genuinely need them.
- Unsupported rules **fail the build** rather than silently dropping meetings.
  Supported: `FREQ=WEEKLY|MONTHLY` with `INTERVAL`, `BYDAY` (incl. `3SA`,
  `-1SU`), `UNTIL`, `COUNT`.
- The engine is hand-written (so the browser doesn't download an RRULE library)
  and conformance-tested against the reference `rrule` package, with the feeds
  cross-checked against Mozilla's ICAL.js — see `tests/recurrence.spec.ts` and
  `tests/feeds.spec.ts`.

These files are the **source of truth**. The aggregate JSON the app imports is
a **generated, git-ignored build artifact** (`content/generated/`) — never
hand-edited, never committed, so two people adding content never conflict on a
shared file.

| Script                        | Command                 | What it does                                                                                                                                                                                                       |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/fetch-wp-content.ts` | `bun run migrate`       | One-time / on-demand migration. Pulls WordPress → the per-item Markdown tree above (clears + rewrites the three dirs). Re-run to re-sync until WP is retired.                                                      |
| `scripts/build-content.ts`    | `bun run build:content` | Network-free. Renders Markdown → HTML, expands recurring events, and assembles `content/generated/*.json` (full + slim splits) plus `sitemap.xml`/`robots.txt` (all git-ignored). Runs before dev/typecheck/build. |
| `scripts/lint-content.ts`     | `bun run lint:content`  | Style checks from `content/config/style-rules.yaml` (San José accent, inclusive language, …). `--fix` applies suggestions. The in-browser editor runs the same rules on every save.                                |

### Calendar views

`/calendar` offers **List**, **Week** and **Month**. Week and Month are
**continuously vertically scrolling** — periods stack in order and you scroll
into the future, so there is no prev/next paging to hunt through (which also
suits a phone). Month is a real `<table>` grid so screen readers get row/column
semantics; for the current month it starts at the current week rather than the
1st, since past weeks would otherwise open the view on empty rows. The active
view lives in the URL (`?view=week`) so it can be shared, and the facet filters
and search apply to every view. See `app/components/CalendarViews.tsx`.

Both grids step by **calendar day** (`new Date(y, m, d + n)`), never by adding
86,400,000 ms — on a daylight-saving boundary local midnight + 24 h is 23:00 on
the _same_ date, which repeats a day and drops the next one. `tests/calendar-grid.spec.ts`
pins the invariant in Pacific time.

### Calendar subscription feeds

`build-content.ts` also prerenders static iCalendar feeds (`scripts/ics.ts`), so
members can subscribe in Apple Calendar / Google Calendar / Outlook — parity with
the WordPress site's "Subscribe to calendar", including its per-category
filtering:

| Feed                                                                      | Contents                                   |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| `/calendar/all.ics`                                                       | Every event                                |
| `/calendar/{working-groups,committees,social,newbie-friendly,online}.ics` | One per on-site filter button              |
| `/calendar/category/<slug>.ics`                                           | One per event category (e.g. `wg-housing`) |
| `/calendar/event/<slug>.ics`                                              | One per event page ("Add to calendar")     |

Facet feeds and the calendar UI share one definition (`app/lib/eventFacets.ts`),
so a subscribed feed always matches what the equivalent filter shows.
**Recurring series are emitted as a single `VEVENT` with an `RRULE`**, so
subscriptions keep generating occurrences indefinitely rather than running out at
the build's horizon. Times carry `TZID=America/Los_Angeles` with a `VTIMEZONE`
block. Cloudflare serves `.ics` as `text/calendar` with no config needed.

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

This is a **Bun workspace with two packages**, one per deployed Worker:

| Package         | Directory | Worker  | What it is                                |
| --------------- | --------- | ------- | ----------------------------------------- |
| `svdsa`         | `.`       | `svdsa` | The static site (this README)             |
| `@svdsa/editor` | `editor/` | `edit`  | The in-browser editor for chapter editors |

They are split so the site never carries the editor's dependencies — Milkdown
and Monaco are ~4 MB that belong to the editor Worker alone. It also means each
Worker's Workers Builds connection is a plain root-directory setting.

```sh
bun install          # one lockfile, installs both packages
bun run dev          # dev server at http://localhost:9999
bun run build        # assemble content + prerender all pages
bun run preview      # preview the built static site
bun run editor:dev   # the editor SPA at http://localhost:9998
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
PR. Workers Builds does the site's deploying, so no Cloudflare secrets are
needed for that.

### The editor Worker

The editor is a **second Worker** (`edit`) built from a **separate workspace
package**, `editor/` — see [editor/README.md](editor/README.md). It deploys via
its own Workers Builds connection using the standard monorepo setup:

| Setting                 | Value                          |
| ----------------------- | ------------------------------ |
| Root directory          | `editor`                       |
| Build command           | `bun install && bun run build` |
| Deploy command          | `bunx wrangler deploy`         |
| Production branch       | `red`                          |
| Non-production branches | **off**                        |

No custom flags and no `CLOUDFLARE_API_TOKEN` anywhere — `ci.yml` runs checks
only. `bun run editor:deploy` still works locally.

**There is exactly one editor deployment, on purpose**, which is why
non-production branch builds are off. The editor is a tool, not a per-branch
artifact: one instance edits any base branch (`?base=`), and the preview links
it hands out point at the _site's_ per-branch previews. Per-branch editor copies
would only create versions to reason about.

> The default/production branch is **`red`** (chapter theming), not `main`/`master`.
