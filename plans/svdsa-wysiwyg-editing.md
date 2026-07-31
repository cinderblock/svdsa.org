# SVDSA.org WYSIWYG Editing

Give chapter editors an in-browser CMS to edit the site without touching git or
WordPress — while keeping the production site a pure, fast static build and git
as the ultimate source of truth.

Related plan: `plans/svdsa-static-rebuild.md` (the base build this extends).

## Goal

- A **CMS admin on a separate edit domain** so the live static site carries zero
  editing code and stays fast/cheap.
- **Hybrid persistence**: edits are saved as **drafts in a database** (instant,
  low-friction, with live preview), and a **"Publish" action commits the changed
  files to the git repo**, which triggers a normal Workers Build → production
  rebuild. Git stays the source of truth; the DB is a fast draft/staging layer.
- **CMS admin + live preview** UX (typed fields + rich-text body + a preview
  pane rendered with the real site components) — not (initially) in-place
  contenteditable on the live page.
- Editable surface: **all of `content/`** (pages, posts, events) **+ site
  config** (nav, home photo strip, external-service embed URLs). **Design/layout
  stays in code** (PRs), not the CMS.
- **A few chapter editors who do NOT have GitHub accounts** sign in (via
  Cloudflare Access / email or Google), and their commits are attributed to
  them without needing repo access.

## Decisions already made (don't re-ask)

- **Persistence = hybrid.** DB drafts → "Publish" commits to git → rebuild.
  (Not pure git-backed, not pure runtime DB.)
- **UX = CMS admin + preview pane**, not in-place WYSIWYG on the live page.
  (In-place editing can be a later enhancement; structured event frontmatter is
  much safer with typed fields first.)
- **Scope = content/ (pages, posts, events) + site config.** NOT design/layout.
- **Auth = a few chapter editors, no GitHub accounts required.** Attribution
  without repo access (bot commits + editor identity in metadata/co-author).
- **Production stays a pure static-assets Worker.** The editor is a _separate_
  Worker/project on its own domain; production `svdsa` Worker is untouched.
- **The editor is a separate workspace package** (`@svdsa/editor`,
  `editor/package.json`), not just a subdirectory. It owns Milkdown/Monaco so
  the site's dependency graph never sees them, and — the deployment reason —
  Workers Builds can then use `editor` as a plain **root directory** and run the
  ordinary `bun install && bun run build`. No `--config` flag, no API token, no
  GitHub Actions deploy step. Both Workers deploy via Workers Builds; `ci.yml`
  is checks-only. Non-production branch builds are **off** for `edit`: one
  editor deployment, deliberately.
- **Build a purpose-built, small custom CMS Worker** (not TinaCMS/Decap/Sveltia).
  Full control of the D1 draft model + Cloudflare Access + GitHub App commit.
- **Editor runs on a `*.workers.dev` domain for now** (e.g.
  `svdsa-edit.isozilla.workers.dev`); a real custom domain is a later call.
- **Publish supports BOTH modes** — direct-commit-to-`red` AND open-a-PR — as a
  configurable publish target. Which one is enabled by default (and who may use
  it) is a **governance decision deferred to the chapter**; the code must not
  hard-code one path. Design the publish layer pluggable from the start.
- Global rules still apply: "best way" not "fastest"; **no `title=` tooltips**;
  **no Cloudflare/DNS/infra change without Cameron's explicit per-change
  authorization** (this now includes creating D1, Cloudflare Access policies,
  the edit custom domain, and a GitHub App — each staged and authorized
  individually).

## Environment / context

- Repo: `C:\Users\camer\git\Personal Projects\svdsa.org` → github.com/cinderblock/svdsa.org (private), default/prod branch **`red`**.
- Stack: React 19 + React Router 8 (framework mode, `ssr:false`, `prerender:true`),
  Vite 8, Bun, TS strict. Path alias `~/*` → `./app/*`.
- Production hosting: **Cloudflare Workers Static Assets**, assets-only
  (`wrangler.jsonc`, Worker name `svdsa`). Deploy = commit → Workers Builds.
- Content model (source of truth): **one Markdown file per item** with YAML
  frontmatter + HTML body, year-bucketed:
  - `content/pages/<url-path>.md`, `content/posts/<year>/…md`,
    `content/events/<year>/…md` (~1070 files).
  - `scripts/build-content.ts` reads these → `content/generated/*.json`
    (git-ignored build artifacts the app imports). Runs before dev/build.
  - Bodies are **WordPress HTML passed through Markdown**; rendered via
    `app/lib/html.ts` (`cleanHtml`) + `app/components/Prose.tsx`.
- Site config lives in **`app/lib/site.ts`** (TypeScript): `SITE`, `EXTERNAL`
  (embed URLs), `CHAPTER_PHOTOS`, `SOCIALS`, `NAV`/`WORKING_GROUPS`/`COMMITTEES`/
  `RESOURCES`. Curated by hand today.
- Preview URLs: `https://<branch>-svdsa.isozilla.workers.dev/`.

## Architecture (target)

Two isolated deployables in one repo:

1. **Production (unchanged)** — `svdsa` static-assets Worker. No server code.
   Source of truth = `content/*.md` + committed config. Publish = a git commit.

2. **Editor (new)** — `svdsa-edit` Worker _with_ server code, on its own domain
   (e.g. `edit.svdsa.org`; start on a `*.workers.dev` subdomain). Components:
   - **Cloudflare Access** in front → chapter editors authenticate with
     email/Google (no GitHub). Access JWT carries editor email for attribution.
   - **CMS admin SPA** (reuses the main app's render components for the preview
     pane — same repo so `app/components/Prose`, `app/lib/html.ts`, event/post
     rendering are importable).
   - **D1** database: `drafts` (path, collection, frontmatter JSON, body, status,
     updated_by, updated_at, base_commit) + `audit`/publish log.
   - **Read published content** live from GitHub (Contents API) so the editor is
     always current regardless of when production last rebuilt; overlay D1
     drafts on top (draft-wins).
   - **Publish** → a **GitHub App** installation token serializes the draft back
     to exact frontmatter+Markdown (gray-matter) and commits to the repo
     (branch or `red`), attributing the editor (committer/co-author). The commit
     triggers Workers Builds → prod rebuild. Draft marked published.
   - **Media**: image uploads → **R2** (or committed to `public/`), with a
     consent/safety gate for member/action photos (see safety note).

Why separate Worker, same repo: production stays zero-JS-editing and fast; the
editor still shares content files and React render code (critical for an
accurate preview), and can be deployed/version-gated independently.

## Resolved (2026-07-21 round 2)

1. **Custom CMS Worker** — build purpose-built, not TinaCMS/Decap/Sveltia.
2. **Both publish modes** (direct-to-`red` and PR) — pluggable target; which is
   default/who-may-use it is a chapter governance decision deferred later.
3. **Media uploads later** — start text + existing-image references.
4. **`*.workers.dev` domain for now** — custom domain deferred.

## Open questions for Cameron (with recommendations)

- (none blocking) — Phase 0 collapses to a lightweight design spike for the
  custom CMS (D1 schema, publish-target interface, Access wiring) rather than a
  build-vs-buy evaluation. Governance (publish permissions) surfaces to the
  chapter before the editor is exposed to real editors.

## Plan / steps (phased)

- **Phase 0 — Design spike.** Custom CMS chosen. Nail down the D1 schema, the
  **pluggable publish-target interface** (direct-commit vs open-PR behind one
  contract), and confirm Cloudflare Access as the auth gate + GitHub App as the
  commit mechanism. Output: schema + interfaces + infra shopping list for
  Cameron to authorize.
- **Phase 1 — Config extraction (main repo, low risk).** Move the _editable_
  parts of `app/lib/site.ts` into committed data files (e.g.
  `content/config/*.json` or `.md`) that the app imports unchanged and the CMS
  can round-trip. Design/layout constants stay in code. No behavior change;
  verify build + tests.
- **Phase 2 — Editor skeleton.** New isolated `svdsa-edit` Worker/project (own
  wrangler config) in the repo. Server framework (Hono or RR server mode).
  Cloudflare Access gate (staged for Cameron). D1 schema + migrations. Read
  published content from GitHub; list collections/items.
- **Phase 3 — CMS admin + preview.** Collection browser → item editor: typed
  frontmatter fields per collection (pages/posts/events, incl. event
  start/end/venue/virtual/categories), rich-text/Markdown body editor, save
  draft → D1, and a **live preview pane** rendered with the real site components.
- **Phase 4 — Publish → commit.** GitHub App token serializes draft → exact
  `.md` and commits (attribution to editor), via a **pluggable publish target**
  implementing both direct-commit-to-`red` and open-PR behind one interface.
  Mark draft published; surface the resulting branch-preview URL / build status.
  Handle draft-vs-newer-commit conflicts (base_commit check).
- **Phase 5 — Media uploads.** R2 (or `public/` commit) with the consent gate;
  image insertion in the body editor.
- **Phase 6 — Hardening.** Roles/permissions, optional PR-review publish path,
  audit log surfacing, conflict UX, Playwright coverage for the editor.

## Findings / gotchas

- Content bodies are **WP HTML inside Markdown**, rendered by `cleanHtml` +
  `Prose`. An accurate preview MUST reuse those exact functions → keep the
  editor in the same repo and import from `app/`. A generic Markdown preview
  would misrender.
- `content/generated/*.json` is git-ignored and rebuilt; the editor should read
  the **`.md` source** (via GitHub) and write `.md`, never the generated JSON.
- Recurring events were collapsed to one file per URL during migration; the CMS
  event model should not assume 1 record = 1 calendar instance.
- Decap/Sveltia's default auth is GitHub OAuth with per-user repo access — does
  not satisfy "editors without GitHub." Any git-backed tool needs a
  bot/gateway commit path to meet the auth constraint.
- **Not every editable file is a document.** Making `content/config/*.yaml`
  editable exposed the assumption that it was: gray-matter finds no `---` in a
  plain YAML file, returns `{}`, and hands the WHOLE file to the rich-text
  editor as a Markdown body. A save would have committed remark's rewrite of it
  (`#` comment → heading, `- label:` → bullets, `href: 'https://…'` →
  `href: '<https://…>'`), breaking every social link. Config now travels as a
  discriminated `{kind: "yaml", text}` that the UI cannot route to Milkdown, and
  is committed verbatim after a parse check. **Any future editable file type
  needs the same question asked of it.**
- **Milkdown brackets bare URLs.** remark-gfm's autolink-literal extension
  re-serializes `https://x` as `<https://x>`, so simply opening a page in the
  rich-text editor and saving rewrote every URL in it. Renders identically —
  so it is invisible on the site and pure noise in every PR diff.
  `serializeMarkdown` unwraps them outside code, only where GFM would linkify
  the bare form anyway (a URL ending in trimmed punctuation must stay wrapped).
- **`Crepe.create()`/`.destroy()` are async.** An effect that doesn't sequence
  them leaves two stacked editors under StrictMode's double-invoke. Each
  instance now owns its own container element and destroy awaits create.
- **Never step through days with `+= 86_400_000`.** Both calendar grids did,
  and on the US fall-back day local midnight + 24 h is 23:00 on the same date —
  the grid repeated a day and dropped the next one, twice a year. React had
  been reporting it as a duplicate-key warning for `2026-11-01`; it was a real
  rendering bug, not log noise. Use `new Date(y, m, d + n)`.
- Playwright's 5 s default is not enough for lazily-loaded Monaco or for a
  route that resolves entirely after hydration, when the suite runs in
  parallel against the dev server. Wait for the editor/route to actually hold
  content, or the assertion silently tests the pre-hydration shell.

## Things not to do

- Do **not** add any editing code to the production `svdsa` Worker or its
  bundle — keep the live site pure static.
- Do **not** touch Cloudflare (D1, Access, custom domain, Workers), DNS, or
  create a GitHub App without Cameron's explicit per-change authorization.
  Stage each change and wait for a yes.
- Do **not** auto-import member/action photos; publishing identifiable members
  (esp. ICE actions) is the chapter's consent/safety call.
- Do **not** use HTML `title=` tooltips in the editor UI.
- Do **not** have the editor write `content/generated/*.json` — write `.md`
  source only.

## Progress log

- 2026-07-21: Plan created. Decisions captured (hybrid persistence; CMS admin +
  preview; scope = content/ + site config, not design; auth = few chapter
  editors, no GitHub). Explored repo: content model, build-content pipeline,
  site.ts config surface, wrangler static-assets setup.
- 2026-07-21 (round 2): Resolved — custom CMS Worker (not Tina); both publish
  modes via pluggable target (governance deferred to chapter); media later;
  `*.workers.dev` domain for now. No blocking open questions. Next: start
  Phase 1 (infra-free config extraction) or Phase 0 design spike.

---

Plan path: `plans/svdsa-wysiwyg-editing.md`
