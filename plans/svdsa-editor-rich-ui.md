# SVDSA editor — rich two-mode editing UI

Plan doc for upgrading the `svdsa-edit` Worker's placeholder textarea into a real
editing surface. Companion to `plans/svdsa-wysiwyg-phase0.md` (the backend/auth
design, already built + deployed).

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

1. [ ] Add deps: `@milkdown/crepe`, `monaco-editor`, `@monaco-editor/react`.
2. [ ] `editor/web/` SPA: index.html, main.tsx, app.tsx, api.ts, styles.
3. [ ] WYSIWYG component (Crepe) + Raw component (Monaco) with imperative refs.
4. [ ] `editor/vite.config.ts` + `editor/tsconfig.json`.
5. [ ] `editor/wrangler.jsonc`: assets binding + run_worker_first.
6. [ ] `editor/src/index.ts`: add `/api/me`; remove inline HTML page.
7. [ ] Root `package.json` scripts: `editor:dev`, `editor:build`, `editor:deploy`.
8. [ ] `bun run editor:build` clean; deploy; smoke-test edit→save→preview.

## Findings / gotchas

- Monaco needs a web worker; markdown has no language-service worker, so only
  `editor.worker` is required. Wire via `?worker` import + `self.MonacoEnvironment`.
- Crepe: `new Crepe({ root, defaultValue })`; pull markdown with
  `crepe.getMarkdown()`; destroy on unmount. Recreate from `body` on mount.
- Crepe CSS must be imported (`@milkdown/crepe/theme/common/style.css` + a theme).
- Bundle is large (Monaco ~hundreds of KB). Acceptable — tool is behind Access.

## Things not to do

- Don't try to fully "control" Crepe/Monaco from React state per keystroke — use
  the imperative getValue handoff.
- Don't put frontmatter into the rich editor.
- Don't add a CDN loader for Monaco (self-contained bundle only).
