# SVDSA.org — "Faithful Design" branch

Branch: `faithful-design` (rebased onto `red`, which now ships the Manifold DSA
brand font — commit "Include the Manifold DSA brand font"). Goal: reskin the
static rebuild so it reads as clearly the _same_ site as the live WordPress one
(`siliconvalleydsa.org`) — same visual language, not pixel-perfect.

The content/routing/data layer is unchanged; this is a **reskin** (global.css +
Header/Footer/home markup + assets).

## Original design DNA (extracted from the live `dsa_wordpress_theme`)

Foundation-Sites based. Key tokens/patterns:

- **Type: `Manifold DSA`** (DSA's official brand typeface), fallback
  Roboto/Helvetica/Arial. Headings & body both. `font-weight: 600` for
  h1–h5/b/strong, `line-height: 1.25`. NOT tightly tracked.
- **Colors:** DSA red `#ec1f27` (primary, heavy), darker `#b91016`, lighter
  `#f04e54`; near-black text `#231f20` / `#0a0a0a`; off-whites `#fefefe`
  `#f7f7f7`; gray footer `#eee`.
- **Top bar:** solid **white**, black nav text; hover/active = **hard invert**
  (black bg, white text), square corners; dropdown submenu has a **3px black
  top border** + shadow; box-shadow under the bar.
- **Hero ("frontispiece"):** full-width **DSA-red band** (`bg-DSAred`).
  Two columns: left = big **white SV-DSA rose logo** on the red; right = a white
  **"plate card"** (rounded 1rem) holding the welcome copy. Heading
  "Silicon Valley" is set in **monospace** (`<code>`), then "Democratic
  Socialists of America", an `<hr>`, then bold-emphasized paragraphs ending
  "Solidarity Forever!".
- **Dispatches:** dark-background section, centered white title, **gray cards
  with a black top-stripe** (`card-gray bdr-stripe-black`), "See All" button.
- **Newsletter:** white card with a **red top border** (0.5rem).
- **Footer:** **gray `#eee`**, black text; **circular social buttons**
  (black → red on hover); widget titles on black bars; "© YEAR Silicon Valley DSA".

## Decisions (locked)

- **Manifold DSA comes from `red`.** A parallel thread landed the brand font on
  `red` (`public/fonts/manifold-dsa/ManifoldDSA-{Medium,Bold}.woff2`, active
  `@font-face`, Inter as the load/failure fallback, README documents provenance
  - chapter authorization). This branch **rebases onto that** and reuses it —
    it does NOT re-decide the font. (Earlier this thread self-hosted the font +
    dropped Inter; reconciled to match `red` on rebase: 2 weights, Inter kept.)
- **Keep light + dark mode.** Match the original in light; keep the dark support
  already built (red band stays red; plate/cards adapt).
- Not pixel-perfect — "more aligned." Reuse existing class vocabulary where
  possible so routes (calendar, event, prose, blog, forms) don't break.

## Assets added (by this branch)

- `public/svdsa-logo.svg` — the tall SV-DSA rose weblogo (white emblem + red
  rose accent), for the hero band.
- (Fonts + `public/fonts/README.md` come from `red`, not this branch.)

## Steps

1. [DONE] Extract original DNA; pull logo; create branch + plan.
2. [DONE] Adjust heading weight/tracking; `--font` uses Manifold (from `red`).
3. [DONE] Reskin Header → white top-bar, black-invert nav, stripe-top dropdowns.
4. [DONE] Reskin hero → red band + plate card + mono wordmark + rose logo.
5. [DONE] Reskin sections → dark "Dispatches", red stripe-top cards.
6. [DONE] Reskin Footer → gray, circular socials, black widget bars.
7. [DONE] Rebase onto `red` (font commit); reconcile font infra; commit.
8. [DONE] Build + tests green; pushed branch → preview URL.
9. [DONE] Rebase onto `red` again to pick up the WYSIWYG editor work; reconcile
   `home.tsx`/`Footer.tsx`/tests (my reskin + red's client-clock filter +
   hydration-safe year merged cleanly). 11/11 chromium tests green.
10. [ ] (Cameron) Merge `faithful-design` → `red` so the editor + new design
        coexist — see Findings below.

## Findings: editor integration (branch-as-draft)

- `red` now holds the WYSIWYG editor: a **separate `svdsa-edit` Worker**
  (`editor/`), editable config extracted to `content/config/*.json`, and
  `setup:editor` tooling. Spec: `plans/svdsa-wysiwyg-phase0.md`.
- **Model = branch-as-draft.** No separate "editor branch." Each edit session
  commits to a throwaway `draft/<editor>/<slug>` branch **off `red`** (authored
  as the editor via a bot credential); Workers Builds deploys it to a preview
  URL; **publish = merge the draft branch into `red`**.
- **Coupling:** the editor's base is `red`. So editors edit/publish against
  `red`, not `faithful-design`. For the editor to operate on the new design,
  the reskin must **land on `red`** (merge). Rebasing kept `faithful-design`
  caught up and trivially mergeable; the actual merge is Cameron's call.

## Things not to do

- Don't break the shared class vocabulary the content/calendar/event/prose
  routes rely on (`.card`, `.btn`, `.prose`, `.event-row`, `.nav`, `.section`).
- No `title=` tooltips (global rule).
- Don't touch infra/deploy.
