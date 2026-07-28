# svdsa-edit — the in-browser editor (Phase 2)

A **separate** Cloudflare Worker from the production `svdsa` site (which stays
pure static). It lets chapter editors — signed in via **Cloudflare Access**, no
git account needed — edit content in the browser. Git stays the single source
of truth. Full design: `plans/svdsa-wysiwyg-phase0.md` +
`plans/svdsa-editor-rich-ui.md`.

## How editing works

- Content bodies are **real Markdown** (converted from the WP migration's HTML);
  the WYSIWYG edits structure, not raw `<p>` soup. Embeds Markdown can't express
  (scripts, iframes, styled divs) survive as raw HTML blocks.
- Each editor gets **one draft workspace branch per base** —
  `draft/<who>/<base>` — so single- AND multi-file edits accumulate together.
  Every save is a commit authored as the editor (bot credential signs it).
- The draft branch's **Workers Build is the live preview** (link in the draft
  bar and after each save).
- **Publish opens a PR** from the draft into its base; review + merge happen on
  GitHub, so nothing lands on `red` unreviewed. **Discard** deletes the draft
  branch. The App needs "Pull requests: Read & write" for publish.
- **+ branch** creates real branches (e.g. `theme/…`) to edit against.

## Rescheduling a repeating meeting

Recurring events are stored as one file with an iCalendar rule, and the editor
exposes that as a **recurrence widget** — a repeat switch, weekly/monthly with a
weekday picker, an optional end date, and "skip a date" / "add an extra date"
for cancellations and reschedules. It previews the next occurrences using the
**same engine the site and the .ics feeds use** (`app/lib/recurrence.ts`), so
what an editor sees is what members get. Nobody has to type an RRULE, and a
one-off event can be turned into a series (or back) from the browser.

Round-trip is verified: opening a series and saving it untouched must not
rewrite its rule (`tests/recurrence-editor.spec.ts` checks every rule in the
real corpus). `tests/editor-ui.spec.ts` drives the widget in a browser with the
API stubbed and asserts the exact frontmatter a save would commit.

## Finding content

The browser groups content the way the **site** is organised — Main pages,
Working groups, Committees, Resources, Recurring meetings, then events and posts
by year — by reading the site's own `content/config/navigation.json` and
matching pages to nav entries. Rows show the title plus the page's live URL (or
the event's date), and are sortable by site order / A–Z / date / newest.

**Jump from the live site:** append `?edit` to any page URL and you land here
with that page open. The site redirects to `edit.<subdomain>` with
`?url=<path>`; `?path=<repo path>` also works.

## UI

Vite-built SPA (`web/`) served by the Worker's Static Assets binding (Worker
keeps `/api/*`): grouped file browser (sections + year buckets, draft-edit
dots), prominent title + typed metadata widgets (toggles, date pickers, comma
lists; WP legacy `id`/`slug`/`path` collapsed under _advanced_), two lossless
body-editing modes (Milkdown WYSIWYG ↔ Monaco Markdown, lazy-loaded), and full
system dark mode.

## API

`/api/me` · `/api/health` · `/api/branches` · `/api/list?base=` ·
`/api/item?path=&base=` (serves the drafted version when one exists) ·
`/api/status?base=` (changed files + open PR) · `POST /api/save` ·
`POST /api/publish` · `POST /api/discard` · `POST /api/branch`

## Layout

```
editor/
  wrangler.jsonc        # svdsa-edit Worker config (nodejs_compat; assets binding)
  vite.config.ts        # builds web/ → dist/
  tsconfig.json         # SPA + Worker types
  src/index.ts          # Worker entry — owns /api/* (assets serve the SPA)
  src/git/github.ts     # GitHub App auth + REST/GraphQL (read/write/branch/commit/compare/PR/titles)
  src/content/
    serialize.ts        # parse/serialize .md + slug/branch helpers (host-agnostic)
    lint.ts             # style-rule engine (shared with scripts/lint-content.ts)
  web/                  # the editor SPA (React)
    app.tsx             # shell: base picker, draft bar, publish/discard, save
    filelist.tsx        # grouped content browser
    frontmatter.tsx     # typed metadata form (touched-fields-only round-trip)
    editors/            # wysiwyg.tsx (Milkdown), raw.tsx (Monaco), monaco-setup.ts
    api.ts, main.tsx, index.html, styles.css
  dist/                 # Vite build output (git-ignored)
```

## Next

Full Access JWT verification, new-file creation, structured event fields,
config (.json) editing, GitLab adapter for the gitlab.com move.

## Develop

```sh
bun run editor:dev      # Vite dev server (web/), proxies /api → wrangler dev
bun run editor:build    # build the SPA → editor/dist
bun run editor:deploy   # build + wrangler deploy
```

## Deploy / configure

```sh
bun run setup:editor          # guided: GitHub App, deploy, secrets, Access
cd editor && bunx wrangler deploy
```

Secrets are set with `wrangler secret put …` (never committed). The git host is
selected by the `GIT_HOST` var (`github` now → `gitlab` at the gitlab.com move);
only the adapter + credential differ — identity, drafts, publish, and Access are
host-agnostic.
