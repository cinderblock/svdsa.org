# SVDSA.org Static Rebuild

Rebuild the Silicon Valley DSA chapter website (currently WordPress) as a
mostly-static React site, hosted on Cloudflare, with periodic rebuilds to
refresh calendar events and blog posts.

## Goal

- Replace the WordPress backend with a fast, static/JAMstack site built on
  Cameron's `ssg-base` (React Router 7 + Vite + Bun, prerendered).
- Host cheaply on Cloudflare with free CDN + per-branch preview builds.
- Prototype on Cameron's GitHub + Cloudflare account; later migrate to DSA's
  GitLab + Cloudflare org.
- V2 (later): in-browser WYSIWYG editing to replace what WP gives editors.

## Environment / context

- Working dir: `C:\Users\camer\git\Personal Projects\svdsa.org` (fresh `git init`, no remote yet).
- Base template copied from: `C:\Users\camer\git\Personal Projects\ssg-base`
  (remote `git@github.com:cinderblock/ssg-base.git`).
- Stack (from ssg-base): React 19, React Router 7 (framework mode, `ssr:false`,
  `prerender:true`), Vite 8, Bun, TypeScript strict, Playwright, oxfmt + lefthook.
  Path alias `~/*` -> `./app/*`. Deploy via GitHub Actions -> Cloudflare Pages.
- Live site: https://siliconvalleydsa.org — WordPress, hosted on Liquid Web.
  Plugins detected: The Events Calendar (Modern Tribe), Yoast SEO, WPForms,
  Redirection, Wordfence.

### Source data APIs (all confirmed OPEN, return JSON, no auth)

- WordPress posts: `/wp-json/wp/v2/posts` (43 blog posts)
- WordPress pages: `/wp-json/wp/v2/pages` (~50 pages)
- The Events Calendar: `/wp-json/tribe/events/v1/events` — 462 event records,
  paginated (`total`, `total_pages`, `next_rest_url`). Fields: title,
  start_date, end_date, venue, organizer, url, description, cost, categories,
  image, is_virtual, virtual_url.
- REST root `/wp-json/` namespaces include: wp/v2, tribe/events/v1, tec/v1,
  yoast/v1, wpforms/v1, redirection/v1, wordfence/v1.

## Feasibility verdict: YES (static + scheduled rebuild)

- Pages + posts: fully static. Rebuild on content change (or daily).
- Calendar: the "most interactive" part, but The Events Calendar exposes a
  clean REST API. Fetch at build time, rebuild hourly/daily via cron
  (GitHub Actions schedule or Cloudflare cron trigger). Client-side JS can
  add filtering/month-view interactivity over the prerendered event data.
- The only genuinely dynamic pieces are **forms** (contact / join / donate).
  Those already delegate to external services in DSA-land (national DSA join,
  ActBlue for donations, Action Network) or can be handled by a small
  Cloudflare Worker / Pages Function. Not a blocker for static hosting.

## Decisions already made (don't re-ask)

- Build on `ssg-base`, not from scratch. (Cameron's explicit ask.)
- Prototype on Cameron's GitHub + Cloudflare; migrate to DSA infra later.
- "Best way", not "fastest" (per global CLAUDE.md).
- **Deploy target: decide at deploy time.** Build framework-agnostic; keep the
  static output portable between Cloudflare Pages and Workers Static Assets.
  Don't over-invest in either deploy path until task 4 (with Cameron).
- **Clone fidelity: content/structure clone with a fresh, clean design.** Same
  pages/nav/content, tidy modern redesign (recognizable DSA branding). Not a
  pixel clone of the WP theme.
- **Content source: NO runtime API dependency.** Content lives in the repo as
  committed files. The WordPress REST API is used ONLY as a one-time migration
  source (dev-time export script), never at build or runtime — the whole point
  is that WordPress can be retired. If something genuinely needs to be dynamic
  later (e.g. frequently-updated events), use a Cloudflare Worker + D1, NOT the
  WP backend. Design the events data layer so it can swap local JSON -> D1
  fetch without restructuring the UI.

## Plan / steps

1. [DONE] Crawl + map live site; confirm REST APIs; assess feasibility.
2. [DONE] Copy ssg-base into svdsa.org; git init; write this plan.
3. [DONE] Base building/running locally (bun install, dev, build).
4. [DONE] Decisions round with Cameron.
5. [DONE] One-time WP export script -> committed content/ (re-runnable).
6. [DONE] Routes/design: layout + nav, WP pages/posts, blog, events.
7. [DONE] Calendar UI: list view with client-side filter + search.
8. [DONE] Forms: /join /donate /contact embed external services.
9. [DONE] Legacy URLs preserved (prerender path list) + /events redirects.
10. [ ] Deploy to Cloudflare with branch previews (WITH Cameron — infra
        rule: per-change authorization required).
11. [ ] Scheduled rebuild (cron) for fresh events/posts.

## Findings / gotchas

- The Events Calendar reports 462 events via API vs 244 URLs in sitemap —
  API paginates recurring-event instances more granularly. Need to decide how
  many/which to prerender (likely: upcoming + recent, not all 462 as pages).
- WP permalink structure for posts is date-based: `/YYYY/MM/DD/slug/`.
  Events live under `/event/<slug>/` (and `/event/<slug>/<date>/` for
  recurring instances). Pages are flat or nested (`/about/`,
  `/political-education/bookclub/...`). Must preserve for SEO/redirects.
- ssg-base deploy.yml is hardcoded to `pages deploy ... --project-name=my-site`
  and runs full Playwright in CI — will need updating.

## Things not to do

- Do NOT touch Cloudflare / DNS / any infra without explicit per-change
  authorization from Cameron (global CLAUDE.md). Deploy step is collaborative.
- Do NOT use HTML `title=` tooltips anywhere (global CLAUDE.md).
- Do NOT hammer the live WP API — cache responses locally; be gentle when
  crawling.

## Progress log

- 2026-07-20: Crawled site via Yoast sitemaps; mapped ~50 pages, 43 posts,
  244 event URLs (462 API records). Confirmed WP + TEC REST APIs open.
  Copied ssg-base into repo, git init, wrote this plan.
- 2026-07-20: Decisions round done (deploy target = decide later; fresh design;
  no runtime API — content committed in repo). Built migration tool
  (fetch-wp-content.ts) -> content/{pages,posts,events}.json (53/41/986).
  build-content.ts derives slim events-upcoming.json + posts-index.json.
- 2026-07-20: Built the site — design system, Header/Footer/Rose/Prose,
  routes (home, calendar w/ filter+search, blog, splat content route for all
  WP pages+posts, 404). 96 paths prerendered. Data split (slim data.ts for
  index pages, full content.ts only on article route) — home no longer pulls
  the 495 KB HTML chunk. Added `~` Vite alias (dev was broken without it;
  caught by tests). 7 Playwright tests pass. README updated.
- 2026-07-20: Verified rendering via built HTML (real events, real WP prose,
  links rewritten to relative, zero title= attrs). Dev server moved to :9999
  (vite.config strictPort; playwright baseURL updated).

## Current state / how to view

- `bun run dev` -> http://localhost:9999 (running now)
- `bun run build` -> build/client (96 static pages)
- Preview MCP (t3-code) needs re-auth to screenshot; verified via built HTML.

## Remaining before/at deploy

- [x] Event detail pages (`/event/<slug>/`) — 459 upcoming prerendered; full
      detail in events-full.json, imported only by the event route. cleanHtml
      extracted to lib/html.ts so Prose doesn't drag pages/posts JSON.
- [x] Embed the real forms — purpose-built /join/ /donate/ /contact/ routes
      with Zeffy / Action Network / Google Form iframes (EmbedFrame). No
      backend needed.
- [x] Image-forward home page — solidarity SVG hero + "In the streets" photo
      strip (CHAPTER_PHOTOS manifest, empty by default pending chapter-cleared
      member photos; see note below).
- [x] Legacy redirects — public/\_redirects (/events/\* -> /calendar, feeds ->
      /blog) + public/\_headers (security + asset caching). Portable to Pages
      and Workers. NOTE: full Redirection-plugin export needs WP admin; only
      the obvious archive redirects are covered.
- [ ] Deploy (task 4, WITH Cameron): choose Pages vs Workers; update
      deploy.yml (currently ssg-base's `pages deploy --project-name=my-site`);
      set CLOUDFLARE_API_TOKEN + account id; branch previews.
- [ ] Scheduled rebuild (cron) to re-run migrate + rebuild for fresh content.

### Member photos — needs Cameron/chapter

Authentic action photos exist in the WP media library (`/wp-json/wp/v2/media`),
including ICE-protest shots. NOT auto-imported: publishing identifiable members
(esp. at ICE actions) is a consent/safety call for the chapter, and committing
them to a repo republishes them. To add: drop cleared photos in
`public/photos/`, list in `CHAPTER_PHOTOS` (app/lib/site.ts) — the "In the
streets" strip then appears. Sample candidates surfaced (for Cameron to vet):
uploads/2026/07/747062966\_\*.jpg, uploads/2026/05/IMG_7731.jpg, IMG_7053.jpg.
