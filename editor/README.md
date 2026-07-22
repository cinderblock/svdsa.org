# svdsa-edit — the in-browser editor (Phase 2)

A **separate** Cloudflare Worker from the production `svdsa` site (which stays
pure static). It lets chapter editors — signed in via **Cloudflare Access**, no
git account needed — edit content in the browser; each save commits to a
**draft branch** (authored as the editor via a bot credential), whose Workers
Builds preview _is_ the draft preview; **publish** merges to `red` or opens an
MR. Git stays the single source of truth. Full design:
`plans/svdsa-wysiwyg-phase0.md`.

## Status

- **Done (this slice):** deployable Worker skeleton (`src/index.ts`,
  Access-aware), the host-agnostic contracts (`src/content/types.ts`), and the
  shared frontmatter (de)serialization (`src/content/serialize.ts`) that
  round-trips the exact on-disk `.md` format.
- **Next (needs the git-host credential — run `bun run setup:editor`):**
  the GitHub and GitLab `GitHostAdapter` implementations, the content API
  (list / read / save-draft / publish), full Access JWT verification, and the
  editor UI + client-side preview.

## Layout

```
editor/
  wrangler.jsonc        # svdsa-edit Worker config (nodejs_compat for gray-matter)
  src/index.ts          # Worker entry (Access-aware placeholder)
  src/content/
    types.ts            # Editor, EditableItem, Draft, GitHostAdapter, PublishTarget
    serialize.ts        # parse/serialize .md + slug/branch helpers (host-agnostic)
    github.ts | gitlab.ts | index.ts   # adapters + factory (next slice)
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
