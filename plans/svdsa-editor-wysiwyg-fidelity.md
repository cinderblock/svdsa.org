# SVDSA editor — make Rich text look like the real page

Deferred work, captured 2026-08-10. Not started. Companion to
`plans/svdsa-editor-rich-ui.md` (which built the three-mode editor) — read that
first for how the editor is put together.

## Goal

Close the gap between the editor's two "what does this look like" surfaces.
Today **Rich text** (Milkdown/Crepe) and **Preview** (the site's own pipeline in
a sandboxed iframe) disagree about the same document, in two related ways:

1. **They don't look alike.** Rich text renders document _structure_ in
   Milkdown's own theme — Milkdown's fonts, spacing, heading scale, link colour,
   table and blockquote treatment. Preview renders the site's. An editor
   composing in Rich text is therefore never seeing the page they're making, and
   has to keep flipping to Preview to check. The Preview mode exists _because_
   of this gap (see `editor/web/editors/preview.tsx`'s header comment); the goal
   here is to shrink the gap until Preview is a confirmation rather than a
   necessity.
2. **Rich text has no honest way to show raw code.** Roughly 20 files still
   carry raw-HTML islands from the WordPress migration (Canva iframes, an
   ActionNetwork embed, a Mailjet form, styled `<div>`s) and ~51 more have
   styled spans. In Milkdown these are neither rendered nor legibly shown as
   source — a `<div>` in the body is a confusing artefact. Preview renders them
   for real (via `rehype-raw`); Rich text needs _some_ deliberate presentation.

Both are about the same thing: Rich text should be trustworthy on its own.

## Why this is deferred, not just "a CSS fix"

The obvious move — point Crepe at the site's `app/styles/global.css` — doesn't
work as stated:

- Preview is deliberately in an **iframe** precisely so the site's stylesheet
  can't fight the editor's. Rich text is in the editor's document, so the site's
  global styles would leak into the surrounding chrome (title input, metadata
  form, file list). Any real solution needs scoping — a `@scope` block, a
  shadow root, or a hand-maintained subset — and each has a cost.
- Crepe ships its own theme (`@milkdown/crepe/theme/frame.css` +
  `frame-dark.css`, media-scoped for dark mode in `editor/web/styles.css`), and
  its editing affordances (block handles, slash menu, toolbar, placeholder) are
  styled by it. Replacing wholesale breaks the editing UI; overriding
  piecemeal is the drift risk the Preview design note warns about.
- The site's `.prose` styles assume the site's layout container. Reproducing
  that inside an editing surface with a cursor in it is not a copy-paste.

## Sketch of an approach (not decided)

1. Extract the typographic core of `.prose` — the part that is genuinely about
   _content_, not layout — into something both the site and the editor import,
   so there is one definition and it can't drift. This is the same principle
   `preview.tsx` already applies by importing `renderMarkdown` and `cleanHtml`
   by relative path.
2. Apply it to the Crepe editing surface only, scoped so it can't escape into
   the editor chrome. `@scope` is the clean expression; check browser support
   against what the chapter's editors actually use before relying on it.
3. Keep Crepe's own chrome styling intact — override content elements, not
   editor affordances.
4. Judge the result by putting Rich text and Preview side by side on the pages
   that stress it (a page with tables, one with blockquotes, one with an embed).

### For the raw-code half

Options, roughly in increasing order of ambition:

- **Show it as code.** A distinct, unmistakable "raw HTML" block — monospace, a
  tinted gutter, a label — so it reads as _source that will be rendered later_
  rather than as broken text. Cheapest, and honest.
- **Render it inert.** Show the actual HTML, non-interactive, with a marker
  saying it's a raw island. Closer to Preview, but re-introduces the sanitizing
  question inside a live editing surface.
- **Replace it with a widget.** The direction `plans/svdsa-editor-rich-ui.md`
  already argues for: remark-directive shortcodes (`::canva{id=…}`,
  `::action-network{form=…}`) from a vetted registry, with matching Milkdown
  block widgets. This _removes_ most of the raw HTML rather than displaying it,
  and is the only option that leaves a WYSIWYG-only member able to edit those
  pages. It's also the biggest piece of work.

The first and third compose: ship the code block now for the long tail, and let
shortcodes retire the common cases over time.

## Things not to do

- Don't inject the site's global stylesheet into the editor document unscoped.
- Don't fork the site's prose styles into the editor — that's the drift the
  Preview design deliberately avoided.
- Don't make Rich text render raw HTML _live and interactive_: an embed that
  runs script inside the editor is a security surface, and clicking a form in
  your own document is a bad time. Preview's `sandbox=""` is the standard.
- Don't drop Preview once Rich text improves. Even a perfect content match
  won't show the page's real chrome, header, or surrounding layout.

## Open questions for the user

1. Is the shortcode registry (option 3) worth doing before or after the visual
   match? My recommendation: **visual match first** — it helps every page, where
   shortcodes help ~20 — but shortcodes are the only fix that makes those 20
   pages editable by a non-technical member.
2. How close is close enough? "Same fonts, same heading scale, same link
   colour" is achievable and cheap; pixel-matching the site's layout inside an
   editor is not, and I'd stop short of it.
