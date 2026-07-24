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
