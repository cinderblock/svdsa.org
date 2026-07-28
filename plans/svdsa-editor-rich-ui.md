# SVDSA editor — rich two-mode editing UI

Plan doc for upgrading the `svdsa-edit` Worker's placeholder textarea into a real
editing surface. Companion to `plans/svdsa-wysiwyg-phase0.md` (the backend/auth
design, already built + deployed).

## 2026-07-24 overhaul (round 2) — SHIPPED

User feedback: "MAJOR overhaul" — `<p>` visible in WYSIWYG, giant file list, no
dark mode, mystery `id`s, what does Save draft even do, need PRs not pushes.
All addressed, committed (545a9f6 content conversion, cb44e51 editor), deployed:

1. **Content converted to real Markdown** — root cause of the `<p>` problem was
   WP HTML stored in .md bodies. `scripts/html-to-md.ts` (turndown) +
   `scripts/convert-html-to-md.ts` (one-time, text-fidelity-verified, 1065
   files) + `scripts/render-markdown.ts` (remark-gfm + rehype-raw) wired into
   build-content.ts. fetch-wp-content converts future pulls. Two pages had
   broken WP markup (unclosed `<a>`) — hand-repaired.
2. **Draft model** — ONE workspace branch per editor+base (`draft/<who>/<base>`,
   serialize.branchName lost its per-file segment). Multi-file drafts, one
   preview, one PR. `/api/status` (changed files + PR), `/api/publish` (opens
   PR; merge on GitHub), `/api/discard`, `/api/branch` (+ UI). `/api/item`
   serves the drafted version when it exists (`fromDraft` chip).
3. **UI** — grouped file browser (`filelist.tsx`: sections + year buckets,
   draft dots, filter), smart metadata (`frontmatter.tsx`: toggles, datetime
   pickers, comma lists, advanced-collapsed WP plumbing, id read-only,
   modified auto-stamped, touched-fields-only round-trip), full system dark
   mode (CSS vars + media-scoped Crepe frame/frame-dark + Monaco vs-dark),
   draft bar with preview/PR/discard.
4. Stale old-scheme branch `draft/cameron/red/2025-07-26-chapter-meeting`
   (a "test change") deleted from origin.

**Watch out:** publish needs the GitHub App to have "Pull requests: Read &
write" — if the App was created with only Contents R/W, grant it in the App
settings and accept on the installation; the API error message walks through it.

**Not yet verified by a human:** the full in-browser flow post-overhaul
(machine-local firefox/GFX breakage made headless UI verification impossible;
chromium API+shell smoke passed, tsc/build clean). The 2 firefox Playwright
failures pre-date this work (reproduced on unmodified baseline).

## 2026-07-24 round 3 — titles, live links, style checks (SHIPPED, 5818153)

- **Pretty titles in the browser** — `/api/titles?dir&base` fetches a whole
  directory's frontmatter titles in ONE GitHub GraphQL round-trip
  (github.ts `titlesForDir`); filelist loads them lazily per expanded group,
  caches per base, shows `date · Title` (date keeps recurring events
  distinguishable), filter searches paths + titles.
- **"view live ↗"** on every open item → production origin (host-derived:
  svdsa-edit.X → svdsa.X) + frontmatter `path`.
- **Content style checks** — rules are chapter-owned data:
  `content/config/style-rules.json` (San José accent = error+autofix,
  "ladies and gentlemen" = error, chairman/you-guys/manpower = warn).
  Engine `editor/src/content/lint.ts` (shared Worker+CLI) masks inline code,
  link targets, bare URLs, HTML tags before matching (slug "san-jose" never
  false-positives; verified). Save responses include findings → listed under
  the editor. CLI: `bun run lint:content` (exit 1 on errors) / `--fix`
  (mask-aware). **1519 pre-existing "San Jose" errors in the corpus — user
  decision pending on running --fix** (touches venue frontmatter too).

## Findings (round 3)

- **2027/2028 events are NOT an import bug**: WP's The Events Calendar
  pre-generates recurring-series instances (~2yr out). Counts: 2025=262,
  2026=500, 2027=203, 2028=11 (mawg + sjfreestore monthlies). User wants
  these as RECURRING EVENTS instead — see next steps.
- Remaining raw HTML after conversion: 20 files with block HTML
  (7 Canva iframes, iatspayments AURA script, mailjet form, ActionNetwork
  embed, 3 styles, ~11 styled divs) + 51 files with styled spans.
  Decision: NO MDX (arbitrary JSX in member content = code execution +
  unWYSIWYGable). Path forward = remark-directive shortcodes
  (`::canva{id=…}`, `::action-network{form=…}`, `::donate-button[label]{url}`)
  rendered to safe HTML at build; Milkdown can grow matching block widgets.

## 2026-07-24 round 4 — SHIPPED (8be5e56, 4a3539f, aa342f5)

1. **Recurring events DONE**: `repeats:` frontmatter (weekly/biweekly/monthly
   nth-or-last weekday, optional until) expanded by
   `scripts/expand-recurring.ts` over a rolling 180-day window in
   build-content (daily cron keeps it moving).
   `scripts/collapse-recurring-events.ts` collapsed 16 series / deleted 365
   future instance files (past kept as history). FIVE series with
   holiday-shifted dates left as instance files pending exception support
   (`skip:`/`moved:`): electoral-wg, intl-solidarity, liberation-and-justice,
   transit-meeting, transit-session. Instance URLs keep the WP shape
   (/event/<slug>/<date>/); note the 2026-era `2025-07-16-mawg` slug's future
   URLs changed to /event/mawg/<date>/ (series templated from newest slug).
2. **Auto-fix on save DONE**: /api/save normalizes + applies rule suggestions
   before committing; response reports autofixed count + remaining warnings.
3. **docs/editing.md DONE**: mermaid flowchart + persona ladder (WYSIWYG-only
   → markdown → git → dev), linked from README.

## Next steps

1. remark-directive shortcodes (vetted component registry) for the 20
   raw-HTML files: ::canva, ::action-network, ::donate-button, ::embed-form.
2. Recurrence exceptions (`skip:` dates / `moved:` map) → collapse the 5
   irregular series; editor UI for repeats (currently JSON-readonly field).
3. New-file creation in the editor; config .json editing (nav/socials —
   would answer "how does an editor change layout-ish things").
4. Corpus-wide `bun run lint:content --fix` (1519 San José) — user decision.

## Goal

Give chapter editors a polished editing experience with **two interchangeable
modes** over the same Markdown body:

1. **WYSIWYG** — live rich-text editing (bold/headings/lists/links render as you
   type, paste-from-Word works, native browser spellcheck). Round-trips to clean
   Markdown so git diffs stay readable.
2. **Raw** — a real code editor ("VS Code embedded"): syntax highlighting,
   find/replace, multi-cursor, minimap. For power users / fixing anything the
   WYSIWYG normalizes.

Toggling between modes is lossless — both edit the same `body` markdown string.

## Decisions already made (don't re-ask)

- **WYSIWYG engine: Milkdown (`@milkdown/crepe`).** Milkdown is ProseMirror +
  remark — Markdown-native, so it emits clean Markdown, not HTML. Crepe is the
  batteries-included distribution (theme, toolbar, slash menu, image/link tools)
  — far less wiring than raw `@milkdown/core`. User picked "Rich WYSIWYG (Milkdown)".
- **Raw engine: Monaco** (`monaco-editor` + `@monaco-editor/react`). Monaco _is_
  VS Code's editor — honors the user's "vscode embedded or something". Bundled
  locally (no CDN loader) via Vite `?worker` import + `loader.config({ monaco })`.
- **Frontmatter is a form, not part of the body editor.** Title/date/etc. render
  as form fields above the editor in BOTH modes. The WYSIWYG/raw pane edits ONLY
  the Markdown body. This keeps mode-toggle lossless and avoids reconciling
  YAML-in-a-rich-editor. (A future "edit frontmatter as YAML" power toggle can come later.)
- **Editor value flow is imperative, not controlled.** App owns `body` as the
  source of truth. Each editor initializes from `body` on mount and exposes
  `getValue()` via a ref. On mode-switch or Save, App pulls `getValue()` →
  `setBody` → swaps component. Crepe and Monaco both resist full React control;
  imperative handoff is the robust pattern.
- **The `/api/*` backend is unchanged.** `save` already takes `{frontmatter, body}`.
  We add only `/api/me` (returns the Access email) for the SPA to show identity.
- **Served as a Vite-built SPA via a Static Assets binding**, mirroring the main
  site. Worker keeps `/api/*` via `run_worker_first`; assets serve the SPA
  (`not_found_handling: single-page-application`).

## Environment / context

- Editor Worker: `svdsa-edit`, deployed via `cd editor && bunx wrangler deploy`
  (wrangler authed as cameron@tacklind.com). Live: https://svdsa-edit.isozilla.workers.dev
- Marked `external: true` in ops (`cloudflare/config/workers/svdsa-edit.yaml`) so
  the account reconciler never prunes it.
- Repo tooling: Bun, Vite 8, React 19, TypeScript, oxfmt, lefthook. No
  `@cloudflare/vite-plugin` — main site uses `react-router build` then wrangler.
- Root `node_modules` is shared; editor deps go in root `package.json`.

## Layout (new)

```
editor/
  wrangler.jsonc        # + assets binding (./dist), run_worker_first ["/api/*"]
  vite.config.ts        # NEW — builds editor/web → editor/dist
  tsconfig.json         # NEW — SPA (DOM/React) types
  src/index.ts          # Worker: /api/* only (+ /api/me); drop inline page() HTML
  web/                  # NEW — the SPA
    index.html
    main.tsx
    app.tsx             # list + base picker + frontmatter form + mode toggle + save
    editors/
      wysiwyg.tsx       # Milkdown Crepe wrapper (imperative getValue ref)
      raw.tsx           # Monaco wrapper (imperative getValue ref)
      monaco-setup.ts   # local Monaco worker wiring + loader.config
    api.ts              # typed fetch client for /api/*
    styles.css
  dist/                 # build output (git-ignored)
```

## Plan / steps

1. [x] Add deps: `@milkdown/crepe`, `monaco-editor`, `@monaco-editor/react`,
       `@vitejs/plugin-react` (dev).
2. [x] `editor/web/` SPA: index.html, main.tsx, app.tsx, api.ts, styles.
3. [x] WYSIWYG component (Crepe) + Raw component (Monaco) with imperative refs.
4. [x] `editor/vite.config.ts` + `editor/tsconfig.json`.
5. [x] `editor/wrangler.jsonc`: assets binding + run_worker_first.
6. [x] `editor/src/index.ts`: add `/api/me`; remove inline HTML page.
7. [x] Root `package.json` scripts: `editor:dev`, `editor:build`, `editor:deploy`.
8. [x] `bun run editor:build` clean; deployed (commit 5d73877). **Smoke-test
       edit→save→preview in the browser is still pending (user to verify).**
9. [x] Folder-aware branch selector (optgroups by first path segment).

## Findings / gotchas

- **Vite `root`/`outDir` resolve against CWD, not the config file.** Run from the
  repo root via `--config editor/vite.config.ts`, so `root: "web"` looked for
  `<repo>/web`. Fixed by anchoring both to the config dir with
  `fileURLToPath(new URL(..., import.meta.url))`.
- **monaco@0.56 `exports` map is `"./*" → "./esm/vs/*.js"`.** So deep imports
  must be `monaco-editor/editor/editor.worker.js` (→ `esm/vs/editor/...`), NOT
  `monaco-editor/esm/vs/editor/...` (that double-prefixes and fails to resolve
  under rolldown/Vite 8). 0.56 also moved per-language files under
  `esm/vs/languages/definitions/`, so hand-picking `basic-languages/markdown`
  no longer works — we import the barrel `monaco-editor` (includes markdown).
- **Bundle:** the barrel Monaco is ~1.5 MB gzip. Kept out of the initial load by
  `React.lazy`-loading the Raw editor — only fetched on switch to Raw mode.
  Eager bundle is then ~518 KB gzip (Milkdown Crepe + React).
  TODO(perf): trim Monaco to markdown-only once 0.56's layout settles.
- Crepe: `new Crepe({ root, defaultValue })`; pull markdown with
  `crepe.getMarkdown()`; `create()` on mount, `destroy()` on unmount. CSS imports
  required (`@milkdown/crepe/theme/common/style.css` + `theme/frame.css`).
- **Frontmatter round-trip reformats dates.** gray-matter parses YAML dates to
  JS `Date`; the API returns them JSON-stringified; saving re-emits them as
  quoted strings. Pre-existing (the old textarea did this too), not a regression.
  Fix later by preserving raw frontmatter formatting. Only _edited_ primitive
  fields are coerced; untouched values pass through as received.

## Related branch work (this session)

- Deleted the dead `update_worker_name_to_svdsa` branch (auto-created by the
  Cloudflare Workers Builds connect flow; its one change was already in `red`).
- Renamed the alternate-theme branches under a `theme/` folder:
  `faithful-design → theme/faithful`, `design-broadside → theme/midnight-rose`.
  Preview URLs changed accordingly. See the `svdsa-design-branches` memory.

## Things not to do

- Don't try to fully "control" Crepe/Monaco from React state per keystroke — use
  the imperative getValue handoff.
- Don't put frontmatter into the rich editor.
- Don't add a CDN loader for Monaco (self-contained bundle only).

## 2026-07-27 round 5 — recurring events become first-class

Prompted by the .ics work: since a subscription's RRULE never runs dry, the
site should derive occurrences the same way instead of baking them.

- **Storage is now iCalendar-native**: `recurrence: {rrule, exdate, rdate}`
  replaces the bespoke `repeats:`. `scripts/expand-recurring.ts` and
  `scripts/ics.ts:rruleFor` are gone (no translation layer).
- **`app/lib/recurrence.ts` is the one engine** — build, browser and feeds.
  Hand-written to keep an RRULE library off the client; conformance-tested
  against `rrule` (23 rule shapes incl. 5th-weekday, last-weekday, COUNT,
  UNTIL, leap Feb) and the feeds cross-checked against Mozilla ICAL.js.
- **All 21 series now have rules** — EXDATE/RDATE let the five holiday-shifted
  WG series collapse at last (electoral, intl-solidarity, liberation & justice,
  both transit ones). The two transit series turned out to be exactly 4-weekly;
  the earlier inference just never tried a 28-day interval.
- **Verified no published date moved**: all 267 previously-baked dates within
  the old 180-day window are reproduced exactly (0 missing, 0 changed).
- Prerender: 90-day window of dated pages + one page per series (390 → 255
  pages). Dated URLs beyond the window render client-side from the rule.
- **The decay risk is closed by design.** The browser expands rules against the
  reader's clock, so the missing cron is now only a freshness optimization.
  Regression test asserts the calendar still lists meetings with the clock set
  to 2099.

### Known gaps after round 5

- The **editor shows `recurrence` as a read-only JSON blob** (the metadata form
  only has widgets for primitives). A proper recurrence editor is the obvious
  next editor slice.
- The three phase-shifting series carry their known deviations as EXDATE/RDATE
  through ~2027-04; **beyond that they generate clean biweekly dates that no WG
  has confirmed.** Worth asking those WGs.
- Still open from earlier rounds: directive shortcodes, socials regression
  (3 of ~8 accounts), 857 unaccented "San Jose", scheduled rebuild.

## 2026-07-27 round 6 — recurrence editor in the WYSIWYG (closes the round-5 gap)

`recurrence` was showing as a read-only JSON blob, so a WYSIWYG-only member
could not reschedule a meeting. Now a first-class widget
(`editor/web/recurrence-field.tsx` + pure model in `recurrence-model.ts`):
repeat switch, weekly/monthly, weekday chips, optional end date, and
skip-a-date / add-a-date for cancellations and moves. Previews upcoming dates
with the SAME engine as the site and feeds, so the editor can't disagree with
what members see. A one-off can be promoted to a series and back.

**Three real bugs found only by driving the UI in a browser** (worth remembering
— none were visible to typecheck, build, or the site's own tests):

1. `values[key] ?? initial` in the frontmatter form treated `null` as nullish,
   so **"stop repeating" silently fell back to the stored rule** — the toggle
   couldn't be turned off.
2. `editor:dev` was broken from the day it was added: the Vite proxy key
   `"/api"` matches by PREFIX, so it swallowed the SPA's own `api.ts` module and
   the app never booted in dev. Fixed with the `^/api/` regex form. (It had
   never been noticed because local testing always went through
   `wrangler dev` against built assets.)
3. Running the site's and the editor's Vite dev servers concurrently made them
   **clobber each other's `node_modules/.vite` dep-optimization cache**, which
   broke client JS on whichever lost the race — this failed 5 site tests that
   depend on hydration. Fixed with a separate `cacheDir` for the editor.

Also fixed while in there: file-list entries were `<a>` elements with no `href`
(not focusable, not announced as links) — now buttons; and the recurrence
enable row was a `<label>` wrapping a `<button>`, which leaked surrounding text
into the control's accessible name.

Test coverage added: `tests/recurrence-editor.spec.ts` (round-trip over every
rule in the corpus) and `tests/editor-ui.spec.ts` (7 browser tests driving the
widget with `/api/*` stubbed, asserting the exact frontmatter a save commits).
The editor had **zero** browser coverage before this. playwright.config.ts now
starts the editor SPA as a second webServer.

## 2026-07-28 round 7 — site batch + editor navigation

Site (066a892): home-page copy moved into content/pages/home.md (frontmatter,
with code-side defaults) so casual editors can change the front page; WG and
committee emoji from the chapter's list in navigation.json, rendered in menus,
home cards and page headings; contact page branch sections removed and socials
shown as red buttons; event categories coloured from a fixed hue table;
online/in-person/HYBRID markers; agenda grouped by day so a date appears once.
Also restored the socials the rebuild had dropped (3 of 6 were missing).

Contact (01d013d): the "contact form" was the **HGO Grievance Form** — the live
WP site links it only as such, and the chapter's contact method is an email
address. Renamed to grievanceForm/grievancePolicy + email; the route now renders
the editable page body instead of a mislabelled embed.

Editor (0bfbe8d): content browsing now mirrors the site's own navigation
(navigation.json ships with /api/list); /api/titles → /api/meta returning title,
live URL, date and recurrence in the same single GraphQL call; two-line rows,
sorting, colour-coded section cards; `?edit` on any live page jumps to the
editor with that file open (?url= / ?path=).

### Open for the chapter

- Emoji: Ecosocialist/Healthcare/Socialist Feminist were NOT in the chapter's
  list — placeholders chosen. Electoral is listed by the chapter as a working
  group but sits under committees in navigation.json — unresolved.
- No general contact form exists; only the email address. If the chapter wants
  one, it needs creating.
