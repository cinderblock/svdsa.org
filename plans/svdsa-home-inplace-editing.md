# Editing the home page by clicking on it

Started 2026-08-11. Companion to `plans/svdsa-editor-rich-ui.md` (how the
three-mode editor is built) and `plans/svdsa-editor-wysiwyg-fidelity.md` (making
Rich text look like the site). This one is a different problem: the home page has
**no body at all**, so no amount of Rich-text fidelity work touches it.

## Goal

Editing the home page should mean looking at the home page and typing on it.

Today it means filling in fourteen unlabelled single-line text boxes named
`kicker`, `headlineTwo`, `groupsIntro` — while the editor devotes its entire main
pane to a body that is deliberately empty.

## Environment / context

- Repo `C:\Users\camer\git\Personal Projects\svdsa.org`, branch `red`.
- Site: React Router 7, prerendered to Cloudflare Workers. Editor: a separate
  Vite SPA under `editor/` (`editor/web/`) with its own `package.json`, served by
  the `edit` Worker.
- The editor already imports site modules **by relative path** on purpose
  (`app/lib/html`, `scripts/render-markdown`, `app/styles/global.css?inline`) so
  there is one implementation and it cannot drift. This plan extends that
  principle rather than inventing a parallel one.

## What is actually happening today

The home page is not a document. It is a fixed layout in `app/routes/home.tsx`
with fourteen short string slots, and those strings live in
`content/pages/home.md`'s **frontmatter** (`app/lib/home.ts:15-48`). That choice
was right — it made the home copy editable through the existing generic page path
with no new machinery. The problem is entirely in how the generic path presents
it.

For `home.md` all three editor modes are useless:

| Mode                                  | What it shows for the home page                   |
| ------------------------------------- | ------------------------------------------------- |
| Rich text (`editors/wysiwyg.tsx`)     | Milkdown on an empty body — nothing to edit       |
| Preview (`editors/preview.tsx:82-85`) | Literally `<h1>Home</h1>` + an empty `.prose` div |
| Source                                | The YAML, plus the placeholder comment            |

The metadata sidebar has **no schema**. `classify()` (`editor/web/frontmatter.tsx:55`)
infers a widget from each YAML value's runtime type. All fourteen copy fields are
strings, so all fourteen become identical one-line `<input>`s labelled with the
raw key (`frontmatter.tsx:214`) — including `lead`, a three-line paragraph in a
one-line box.

The body needed _something_ in it, which is where the placeholder HTML comment
came from. That comment is the seam showing: the file apologising for being the
wrong shape for its editor. It is a symptom, not the disease.

## Decisions already made (don't re-ask)

1. **Go straight to in-place editing** (Cameron, 2026-08-11). Not a
   schema-driven metadata form first — click the real page and type. A form was
   offered as a cheaper intermediate step and declined.
2. **The home page gets special elevation to the top of the file list**
   (Cameron, 2026-08-11).
3. **Structure and layout stay in code.** Only the words are editable. This is
   the existing contract in `app/lib/home.ts:1-11` and it is not being widened.
4. **Every slot keeps its shipped default.** `home.ts:9-10` — an editor cannot
   break the page by clearing a field. Retained, but see the gotcha below about
   what that hid.

## Approach

### The pivot: one component, rendered by both the site and the editor

`app/routes/home.tsx` currently reads the module-level `HOME` singleton directly
(`{HOME.headline}` and so on). Replace each read with a `<Slot k="headline" />`
that pulls from a React context.

- **On the site**, the context default is the build-time `HOME`, so `Slot`
  renders a plain string and behaviour is byte-identical.
- **In the editor**, a provider supplies the live values _and_ an editable
  renderer, so the same slot becomes a `contenteditable` region.

This is the crux: the editor renders the **real home route**, not a lookalike. It
cannot drift, for the same reason Preview's markdown pipeline cannot drift.

### Rendering it: a same-origin iframe the parent renders into

Create an `<iframe>`, wait for load, inject the site stylesheet and a
`<base href>` into its document, then mount a React root into its body. Because
it is same-origin, the parent manipulates it directly — no `postMessage`, no
bundle-in-`srcDoc`.

Why an iframe rather than a shadow root or plain scoping:

- **CSS isolation both ways** — the same reason `preview.tsx:20-22` gives.
- **Media queries resolve against the iframe's own width.** This matters here in
  a way it doesn't for prose: the home page is a hero grid and two card grids. In
  a shadow root, media queries would answer to the editor window's width and the
  responsive layout would be a lie.
- `<base href>` keeps `/solidarity.svg` and `/media/...` resolving as they do in
  production.

### On the sandbox

`preview.tsx:97-101` uses `sandbox=""` — no `allow-scripts`, no
`allow-same-origin` — and that is correct **there**, because that pane renders
`rehype-raw` output from migrated WordPress markdown containing real embeds,
forms and scripts.

That reasoning does not transfer to this pane, and the difference should be
stated rather than assumed. The home preview renders our own React components
against plain strings. There is no raw-HTML island anywhere on the home page:
post excerpts are `p.excerpt.slice(0, 140)` rendered as text nodes
(`home.tsx:157`), and `Prose` is never used. So a same-origin iframe here is
executing only editor code, which is the same trust level as the editor itself.

**The markdown `Preview` component keeps `sandbox=""` and is not touched.** This
is a second, separate component for a surface with a different threat model.

### Editing model

Slots are **uncontrolled** `contenteditable` elements. React must not re-render
the node's text while the caret is in it, so the text is written through a ref
only when it differs from the DOM's current content — which is never true for
your own keystrokes.

- `contenteditable="plaintext-only"` where available, plus a `paste` handler that
  strips formatting, because these values are YAML strings and must not acquire
  markup.
- Enter is suppressed on single-line slots.
- Edits call the **same `onChange(key, value)`** the existing `FrontmatterForm`
  uses, so `buildFrontmatter`'s touched-fields-only round trip
  (`frontmatter.tsx:114-147`) and the whole save/draft/publish path work
  unchanged. This is the piece that keeps the change small.

## Plan / steps

All nine landed on 2026-08-11. `tests/home-editor.spec.ts` passes (6 tests),
`bun run typecheck` is clean, and the editor bundle builds — the home pane is a
139 kB lazy chunk (22 kB gzip).

- [x] **1. `app/lib/home.ts`** — export `DEFAULTS` and a `HOME_SLOTS` descriptor
      (key → human label, which section it belongs to, single- vs multi-line).
      Keep `HOME` exactly as it is.
- [x] **2. The `Slot` component + context**, next to `home.ts`. Default context
      = build-time `HOME`; renders a bare string.
- [x] **3. `app/routes/home.tsx`** — swap the fourteen `{HOME.x}` reads for
      `<Slot k="x" />`. No layout change. Site output must be identical.
- [x] **4. `editor/vite.config.ts`** — add the `~` → `app/` alias, and alias
      `react-router` to a shim exporting `Link` as a non-navigating `<a>`. The
      editor is not a routed app, and a link in a preview must not navigate.
- [x] **5. `editor/web/editors/home-preview.tsx`** — the iframe + portal +
      editable provider.
- [x] **6. `editor/web/app.tsx`** — when the open item is the home page, show
      that pane instead of the three normal modes.
- [x] **7. `editor/web/filelist.tsx`** — `home.md` → `/`, pinned to the top.
- [x] **8. Delete the placeholder comment** from `content/pages/home.md`.
- [x] **9. Tests** — a Playwright spec that opens the home page in the editor,
      types into the headline, and asserts the frontmatter it would save.

## Findings / gotchas

### The file list can never match the home page (step 7's root cause)

`filelist.tsx:39-41` derives a page's URL from its **filename**:

```ts
const urlForPage = (p: string) =>
  "/" + p.replace(/^content\/pages\//, "").replace(/\.md$/, "") + "/";
```

So `content/pages/home.md` yields `/home/`. The "Main pages" group tests against
`MAIN = ["/", "/about/", ...]` (`filelist.tsx:67`), and `/home/` matches nothing —
the `"/"` entry in that list is **dead code that can never match any file**. The
home page therefore lands in "Other pages", which is collapsed by default.

Same bug in the `?url=` deep-link resolver (`app.tsx:176-186`), so `?url=/` never
resolves either.

The tree-mirrors-the-URL convention holds for every page except this one; home is
the single exception and has to be spelled out. Note that fixing it via the API's
`ItemMeta.url` is not available: `buildGroups` runs on paths before metadata has
loaded.

Sorting also needs a change, not just grouping. `sortItems` under "Site order"
does `a.localeCompare(b)` on repo paths (`filelist.tsx:216`), which would put
Home fifth of six, after `about`, `bylaws`, `contact` and `donate`. "Site order"
for the main group should mean the `MAIN` array's order, which puts Home first
and is more honest about what that sort claims to do.

### `react-router` is not an editor dependency

`editor/package.json` has no `react-router`, but `app/routes/home.tsx` imports
`Link` from it. Aliasing to a shim is preferred over adding the dependency: the
editor has no router to provide the context `Link` needs, and a preview's links
must not navigate anyway (the markdown preview already neutralises them with
`a{cursor:default}`, `preview.tsx:80`).

### The home preview pulls the events and posts corpus into the editor bundle

`home.tsx` imports `~/lib/data`, which imports `events-upcoming.json`,
`events-series.json` and `posts-index.json`. Lazy-load this pane the way `Raw`
and `Preview` already are (`app.tsx:33-39`) so it stays out of the initial
payload.

### Data was deleted, and has already been put back — resolved 2026-08-11

Recorded because the trap is still worth knowing, not because anything is
outstanding.

`b34baca` ("content: re-import from the WordPress WXR export") landed the WXR
importer's output by wholesale-replacing `content/{pages,posts,events}`, which
deleted everything the importer does not produce: all 21 recurrence rules, both
draft canaries, and `content/pages/home.md`. 438 files deleted, 187 added. The
importer is not at fault and does not live in this repo.

A parallel session fixed it in **`b33aeb0`** ("content: restore the 21
recurring-meeting rules the WXR re-import dropped"), restoring from `3184766`.
Nothing had shipped. Verified on 2026-08-11: 21 files carry `recurrence:`,
`home.md` is tracked, `home.json` is populated again.

**The instructive part is how quiet the home-page half was.** The recurrence loss
broke twelve tests. The home-page loss broke nothing, because
`app/lib/home.ts:52-56` falls back to `DEFAULTS` field by field — so the page
kept rendering, three strings shorter:

- `lead` lost "DSA is the largest socialist organization in America, with
  120,000+ members nationwide."
- `groupsIntro` lost "Jump in wherever your energy is — no experience required."
- `closingIntro` lost "Solidarity Forever!"

The graceful degradation that stops an editor breaking the page also stops anyone
noticing the copy is gone. Worth remembering before adding more silent fallbacks:
`plans/i18n.md` is about to add a per-language one.

Note `plans/i18n.md:67-70` still says `red` is clean and that `b34baca` is only on
`import/wxr-2026-08-10`. That was true when written and is now stale — `b34baca`
is an ancestor of `red`, and `b33aeb0` is the fix.

### Two more things that had to be settled while building it

**A React portal into an iframe cannot receive events.** React attaches its
listeners to the root container, so a portal from the editor's root into the
frame's body puts the listeners in the editor's document — where events raised
inside the frame never arrive. Nothing would have been typeable, and it would
have looked like a CSS problem. The pane therefore creates a second React root
_inside_ the frame (`createRoot(frameDoc.body)`) and re-renders it when the copy
changes.

**Accessible names must not be prefixes of each other.** `headlineTwo` was
labelled "Headline, second line", which made `Hero: Headline` an ambiguous
accessible name — two elements matched. Renamed to "Second line". Worth
remembering for any future slot list: these labels are the addressable name of
the control, not decoration.

## Things not to do

- **Don't render the home preview in the editor's own document.** The site's
  global stylesheet would fight the editor chrome — the exact problem
  `preview.tsx:20-22` and `plans/svdsa-editor-wysiwyg-fidelity.md` were written
  about.
- **Don't use a shadow root** for this one. It solves CSS but not media queries,
  and this page is mostly layout.
- **Don't relax `sandbox=""` on the markdown `Preview`.** The exception argued
  above is specific to a pane with no untrusted HTML in it. Two components, two
  threat models.
- **Don't reimplement the home layout in the editor.** The whole point is that
  the editor renders `app/routes/home.tsx` itself.
- **Don't widen the contract to editing structure** — no adding sections, no
  reordering, no rich text in slots. These are YAML strings.
- **Don't make slots controlled React inputs.** Re-rendering a `contenteditable`
  from state while it has focus destroys the caret position.

## Open questions for the user

1. Should the home page be the first row _inside_ "Main pages", or its own pinned
   row above the search box? Recommendation: first row inside Main pages, with
   that group ordered by site order rather than alphabetically — it reads as part
   of the site rather than as editor furniture.
2. The three hard-coded strings that are _not_ editable — "Join DSA" and
   "Newsletter signup" (`home.tsx:177,180`), and the section links "Full calendar
   →", "About the chapter →", "All posts →". Leave them in code, or promote them
   to slots while we are here? Recommendation: leave them; they are navigation
   labels, not copy, and the closing section already has editable heading and
   intro.
