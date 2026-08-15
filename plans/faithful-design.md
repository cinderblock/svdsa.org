# SVDSA.org — "Faithful Design" branch

Branch: `theme/faithful` (formerly `faithful-design`; rebased, then merged, onto
`red`, which ships the Manifold DSA brand font — commit "Include the Manifold
DSA brand font"). Goal: reskin the static rebuild so it reads as clearly the
_same_ site as the live WordPress one (`siliconvalleydsa.org`) — same visual
language, not pixel-perfect.

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
10. [ ] (Cameron) Merge `theme/faithful` → `red` so the editor + new design
        coexist — see Findings below.
11. [DONE] Restore the frontispiece after the `red` merge silently dropped it,
    and move Dispatches to the top — see "Findings: the merge that undid the
    reskin".

## Findings: the merge that undid the reskin

`76df3ef` ("Merge branch 'red' into theme/faithful") resolved `app/routes/home.tsx`
in **red's** favour, so the branch shipped red's hero — a marketing couplet in
near-black **on the red band** with the emblem boxed in a bordered card at the
right. The plate card was gone. Nothing failed loudly: the `.plate` CSS survived
untouched in `global.css` (orphaned), and `tests/home.spec.ts` kept asserting
`.plate` contains "working class power" — a test that must have been red at the
time of the merge. **Lesson: this branch's home tests are the tripwire for the
reskin; a merge that leaves them red has eaten the design.**

Restored 2026-08-14, and reconciled with the editor rather than around it:

- The hero is the frontispiece again — `.hero__logo` (emblem, unboxed, on the
  red) at the left, `.plate` at the right with the monospace `Silicon Valley`
  wordmark over `Democratic Socialists of America`, a rule, the welcome copy,
  and the three buttons.
- **Every hero word is still a `<Slot>`.** `headline`/`headlineTwo` are the two
  wordmark lines on this theme, `lead` is the welcome paragraph, `kicker` is a
  small red eyebrow over the plate (the original has none, but a slot the
  editor offers and the page never renders is worse than an addition). The slot
  set, its labels and the editor are untouched, so the branch stays trivially
  mergeable into `red`.
- Consequently this branch **does** diverge on content: `content/pages/home.md`
  and the `DEFAULTS` in `app/lib/home.ts` carry the faithful words. That breaks
  the old "content layer unchanged" claim above, deliberately — falling back to
  red's copy would set "Building working-class power," in the wordmark's
  monospace. Expect a conflict in those two files on the merge to `red`, and
  resolve it toward whichever hero `red` ends up with.
- Dispatches moved directly under the hero, as on the live site. The Join CTA
  dropped `--alt` so it doesn't abut the working groups' tint as one gray slab.
- Fixed a bug that predates the merge: `.section--dark h3 { color: #fff }` also
  hit `.card h3`, so every dispatch title was **white on a white card**. Cards
  on the dark band now opt back out to `var(--text)`.

New tests guard both: "dispatches lead the page, directly under the
frontispiece" and "a dispatch's title is legible on its card"
(`tests/home.spec.ts`).

### Known gaps against the original

- The plate holds **one** paragraph where the live site has three, because
  `lead` is a plain string and the original's copy is full of inline
  `<strong>`/`<em>`/links. Closing that needs inline markdown in the slot layer,
  end to end through the editor's contenteditable — deliberately not done.
- Footer socials are black pills with text labels; the original uses circular
  icon buttons. Never done on this branch, not a regression.

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
