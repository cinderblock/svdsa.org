# svdsa-edit — the in-browser editor (Phase 2)

A **separate** Cloudflare Worker from the production `svdsa` site (which stays
pure static). It lets chapter editors — signed in via **Cloudflare Access**, no
git account needed — edit content in the browser. Git stays the single source
of truth. Full design: `plans/svdsa-wysiwyg-phase0.md` +
`plans/svdsa-editor-rich-ui.md`.

## This is its own package

`@svdsa/editor` is a **workspace package** (`editor/package.json`) inside the
site repo, not part of the site's build. That boundary is load-bearing: Milkdown
and Monaco are ~4 MB of dependencies that belong to this Worker and must never
enter the site's dependency graph.

```sh
bun install      # from anywhere in the repo — one lockfile, one install
bun run dev      # SPA dev server on :9998 (or `bun run editor:dev` from the root)
bun run build    # web/ -> dist/
bun run deploy   # build, then wrangler deploy
```

Because it's a normal package, **Cloudflare Workers Builds points at `editor` as
its root directory** and runs the ordinary `bun install && bun run build` —
no `--config` flags and no API token. See the table in the root README.

The boundary is one-way, though: the editor imports site files by relative path,
deliberately, wherever showing an editor what they're making means running the
site's own code. One implementation, so it cannot drift.

| From the site                | Used for                                         |
| ---------------------------- | ------------------------------------------------ |
| `app/lib/recurrence.ts`      | The recurrence widget's date preview             |
| `scripts/render-markdown.ts` | Preview — the exact processor the build runs     |
| `app/lib/html.ts`            | Preview — the cleanup step the site applies      |
| `app/styles/global.css`      | Preview and Page, as text, injected into a frame |
| `app/routes/home.tsx`        | The **Page** view below — it IS the home page    |

The site imports nothing from `editor/`. Milkdown and Monaco stay on this side.
`vite.config.ts` carries the `~/` alias and a `react-router` stand-in that make
the last row possible.

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
- **Every branch is a whole site.** The header's branch picker switches which
  one you're editing; **Browse all branches** opens the branch browser — every
  branch with its preview URL, last commit, drift from `red`, and any open PR.
  Real branches (e.g. `theme/…`) are created there too, off whichever branch
  you're on. Deep link: `/?branches`.

## Three views of the same document

**Rich text** (Milkdown) · **Source** (Monaco, the Markdown itself) · **Preview**.

The preview is not redundant with the WYSIWYG, which is the obvious objection.
Milkdown shows document _structure_ in Milkdown's theme — not the site's fonts,
spacing, colours or components — and the raw-HTML islands the migration
preserved (embeds, forms, styled divs) **don't render there at all**. For ~20
files that's most of the page.

Fidelity comes from reusing the site's real pipeline by relative import, so it
cannot drift:

| Step            | Module                               | Why it matters                                                                           |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Markdown → HTML | `scripts/render-markdown.ts`         | The exact processor `build-content.ts` runs — remark + GFM + `rehype-raw`                |
| HTML cleanup    | `app/lib/html.ts` (`cleanHtml`)      | Rewrites absolute svdsa.org links, strips `title=`. A lookalike renderer would skip this |
| Styling         | `app/styles/global.css` in an iframe | The site's own stylesheet, isolated from the editor's                                    |

The iframe carries `<base href>` pointed at the live origin, so fonts, images and
relative links resolve exactly as they do on the real page — including resolving
to **nothing** where a page is genuinely broken. A WordPress upload shows as a
broken image here, because that is what a reader gets today.

It's `sandbox=""` — no `allow-same-origin`, no `allow-scripts` — so preview
content can't reach back into the editor and `<script>` islands stay inert. And
it's lazily loaded (72 kB gzip), so the pipeline only downloads if you open it.

**Known gap:** having to flip to Preview to see what you're making is a cost,
not a feature, and Rich text still has no honest way to show those raw-HTML
islands. Closing both is planned in
`plans/svdsa-editor-wysiwyg-fidelity.md` — including why the obvious fix
(point Milkdown at the site's stylesheet) doesn't work as stated.

## The home page, which is none of those things

The front page has no body. It's a fixed layout with fourteen word-shaped holes
in it, filled from `content/pages/home.md`'s frontmatter — so all three views
above show an empty document, and the words end up as unlabelled text boxes in
the metadata form.

It gets one view instead, **Page**, which renders the site's own
`app/routes/home.tsx` and makes each of those fourteen words editable where it
sits. You change the headline by clicking the headline. Everything else on the
page — the events, the working-group cards, the dispatches — is really there,
pulled from the same content the site builds from, because it is the same
component.

A few consequences worth knowing:

- **Blank means the shipped default**, not a blank heading (`app/lib/home.ts`).
  Clear a slot and the default reappears when you click away — that's what the
  page will render, so that's what you're shown.
- **Enter does nothing.** Each slot is a single YAML string, including the
  paragraphs.
- **Structure isn't editable**, only words. Sections, order and layout stay in
  the route.
- This frame is same-origin and runs scripts, unlike the Markdown preview above.
  It renders our own components against plain strings — there's no raw HTML on
  the home page — so there is nothing here to sandbox away. The Markdown preview
  keeps its `sandbox=""`; two panes, two threat models.

→ `plans/svdsa-home-inplace-editing.md`

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
`?url=<path>`; `?path=<repo path>` also works. Both the file browser and this
resolver get a page's address from `src/content/urls.ts`, which is also what the
link checker uses — one definition, so `/` reaches the home page rather than the
`/home/` its filename would suggest.

## UI

Vite-built SPA (`web/`) served by the Worker's Static Assets binding (Worker
keeps `/api/*`): grouped file browser (sections + year buckets, draft-edit
dots), prominent title + typed metadata widgets (toggles, date pickers, comma
lists; WP legacy `id`/`slug`/`path` collapsed under _advanced_), three views of
the body (Milkdown WYSIWYG ↔ Monaco Source ↔ Preview, the last two
lazy-loaded) — or the in-place **Page** view for the home page — and full system
dark mode.

## API

`/api/me` (identity + whether Access is enforced) · `/api/health` ·
`/api/branches` (names, for the picker) · `/api/branch-info` (the branch
browser's richer view — preview URL, last commit, ahead/behind, PR — in one
GraphQL round-trip) · `/api/list?base=` (paths + site nav + category vocabulary) ·
`/api/item?path=&base=` (serves the drafted version when one exists; returns a
discriminated `kind: "markdown" | "yaml"`) · `/api/meta?dir=&base=` ·
`/api/status?base=` (changed files + open PR) · `POST /api/save` (compare-and-swap
on the loaded blob sha; 409 on conflict) · `POST /api/create` (intent, not a path)
· `POST /api/rename` (atomic move + redirect) · `POST /api/publish` ·
`POST /api/discard` · `POST /api/branch`

Every route but `/api/health` requires a verified Cloudflare Access identity and
fails closed. Writes are confined to `content/` by one shared predicate.

## Layout

```
editor/
  wrangler.jsonc        # svdsa-edit Worker config (nodejs_compat; assets binding)
  vite.config.ts        # builds web/ → dist/
  tsconfig.json         # SPA + Worker types
  src/index.ts          # Worker entry — owns /api/* (assets serve the SPA)
  src/git/github.ts     # GitHub App auth + REST/GraphQL (read/write/branch/commit/compare/PR/titles)
  src/access.ts         # Cloudflare Access JWT verification (fails closed)
  src/content/
    serialize.ts        # parse/serialize .md, path predicates, autolink cleanup
    newItem.ts          # every naming convention: path <-> URL, create, rename
    links.ts            # internal link checking (shared with lint-content.ts)
    lint.ts             # style-rule engine (shared with scripts/lint-content.ts)
  web/                  # the editor SPA (React)
    app.tsx             # shell: branch picker, draft bar, publish/discard, save
    picker.tsx          # filterable popover picker — our <select> replacement
    branches.tsx        # branch browser: every branch and its preview link
    filelist.tsx        # grouped content browser
    frontmatter.tsx     # typed metadata form (touched-fields-only round-trip)
    wizard.tsx          # "what are you adding?" — new content, no path typing
    editors/            # wysiwyg.tsx (Milkdown), raw.tsx (Monaco),
                        # preview.tsx (the site's own renderer), monaco-setup.ts
    styles.css          # a MANIFEST — @imports styles/, in cascade order
    styles/             # one file per nameable thing, mostly per component:
                        # tokens, base, shell, topbar, draftbar, picker,
                        # branches, filelist, document, frontmatter,
                        # recurrence, wizard, notices, preview
    api.ts, main.tsx, index.html
  dist/                 # Vite build output (git-ignored)
```

## Next

Indexed with everything else in [`../TODO.md`](../TODO.md).

Image upload (tracked separately — the WordPress uploads that didn't survive
the migration are the initial payload), spellcheck with a chapter dictionary,
structured forms over the config YAML, a diff before publishing, delete, and a
GitLab adapter for the gitlab.com move.

## Who can edit

Access is enforced: the Worker verifies the **signed** Cloudflare Access JWT on
every `/api/*` call, checking the signature against the team's keys and the
`aud` claim against this application's audience tag. It fails closed — no valid
token, no editor — and refuses to serve at all if it is misconfigured, rather
than falling back to trusting a header. See `src/access.ts`.

**Adding or removing an editor** is a one-field change: add their email to the
**"Web Editors"** Access policy. No git account, no invitation, nothing in this
repo.

<https://dash.cloudflare.com/4ce5029d216dd48d4516b29665d12e5a/one/access-controls/policies/f987e6fd-ba12-49a4-b593-666ef9dc2625/edit>

They sign in with whatever identity provider is enabled on the application
(Google, GitHub, email one-time-code, …) and their commits are authored under
that email.

> ⚠ That link, the account ID and the `CF_ACCESS_*` vars in `wrangler.jsonc`
> are all on the SVDSA **test** account. When the chapter approves the move to
> their own account, every one of them changes — re-run `bun run setup:editor`
> against the new account rather than editing by hand.

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
