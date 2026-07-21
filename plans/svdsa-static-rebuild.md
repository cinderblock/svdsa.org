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

## Open questions for the user (see AskUserQuestion round 1)

1. Deploy target: Cloudflare **Pages** (what ssg-base is wired for, `*.pages.dev`
   branch previews) vs **Workers Static Assets** (`*.workers.dev`, the newer
   path Cloudflare is steering toward). Cameron said "workers.dev" — lean Workers,
   but ssg-base ships Pages config. RECOMMENDATION: confirm which.
2. Clone fidelity: pixel-faithful visual clone of current WP theme, or
   content+structure clone with a cleaner fresh design? RECOMMENDATION:
   content/structure clone, tidy design, since a rebuild is the point.
3. Content pull: fetch real content from the WP REST APIs at build time
   (recommended — proves the thesis) vs hand-copy a few representative pages
   for the prototype.

## Plan / steps

1. [DONE] Crawl + map live site; confirm REST APIs; assess feasibility.
2. [DONE] Copy ssg-base into svdsa.org; git init; write this plan.
3. [ ] Get base building/running locally (bun install, dev, build).
4. [ ] Decisions round with Cameron (the 3 open questions above).
5. [ ] Data layer: build-time fetch scripts for pages/posts/events ->
       local JSON (cached, committed or generated in CI).
6. [ ] Routes/design: layout + nav matching site IA (Calendar, About,
       Resources, Blog, Join/Donate); working-group/committee pages;
       blog index + post pages; event index + event pages.
7. [ ] Calendar UI: month/list view with client-side filtering.
8. [ ] Forms strategy (contact/join/donate) — external links or Worker.
9. [ ] Preserve legacy URLs / redirects (Redirection plugin export + WP
       permalink structure `/YYYY/MM/DD/slug/`).
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
  Copied ssg-base into repo, git init, wrote this plan. Next: get it building,
  then decisions round with Cameron.
