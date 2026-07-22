# svdsa-edit — the in-browser editor (Phase 2)

A **separate** Cloudflare Worker from the production `svdsa` site (which stays
pure static). It lets chapter editors — signed in via **Cloudflare Access**, no
git account needed — edit content in the browser; each save commits to a
**draft branch** (authored as the editor via a bot credential), whose Workers
Builds preview _is_ the draft preview; **publish** merges to `red` or opens an
MR. Git stays the single source of truth. Full design:
`plans/svdsa-wysiwyg-phase0.md`.

## Status

- **Done:** deployed Worker (`src/index.ts`, Access-aware) with the content API
  (`/api/me`, `/api/branches`, `/api/list`, `/api/item`, `/api/save`,
  `/api/health`); GitHub App auth (`src/git/github.ts`); shared frontmatter
  (de)serialization (`src/content/serialize.ts`); and the **rich editing UI** —
  a Vite-built SPA (`web/`) served by the Worker's Static Assets binding, with
  two interchangeable body editors (Milkdown WYSIWYG ↔ Monaco raw), a
  frontmatter form, and a folder-aware branch selector. Save → draft branch →
  the branch's Workers Build preview.
- **Next:** publish (merge to base / open MR via `PublishTarget`), full Access
  JWT verification, structured event fields, GitLab adapter for the gitlab.com move.

## Layout

```
editor/
  wrangler.jsonc        # svdsa-edit Worker config (nodejs_compat; assets binding)
  vite.config.ts        # builds web/ → dist/
  tsconfig.json         # SPA + Worker types
  src/index.ts          # Worker entry — owns /api/* (assets serve the SPA)
  src/git/github.ts     # GitHub App auth + REST (read/write/branch/commit)
  src/content/
    types.ts            # Editor, EditableItem, Draft, GitHostAdapter, PublishTarget
    serialize.ts        # parse/serialize .md + slug/branch helpers (host-agnostic)
  web/                  # the editor SPA (React)
    app.tsx             # list + base picker + frontmatter form + mode toggle + save
    editors/            # wysiwyg.tsx (Milkdown), raw.tsx (Monaco), monaco-setup.ts
    api.ts, main.tsx, index.html, styles.css
  dist/                 # Vite build output (git-ignored)
```

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
