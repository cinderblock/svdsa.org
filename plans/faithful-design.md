# SVDSA.org — "Faithful Design" branch

Branch: `theme/faithful` (formerly `faithful-design`; rebased, then merged, onto
`red`, which ships the Manifold DSA brand font — commit "Include the Manifold
DSA brand font"). Goal: reskin the static rebuild so it reads as clearly the
_same_ site as the live WordPress one (`siliconvalleydsa.org`) — same visual
language, not pixel-perfect.

It began as a pure **reskin** — global.css, Header/Footer/home markup, assets —
and the routing/data layer is still untouched. It is no longer content-neutral:
the front page's words and the nav's shape are the original's now, so home.md,
`app/lib/home.ts` and `app/lib/site.ts` belong to this branch too. See the
2026-08-15 findings.

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
12. [DONE] Take the top bar, the footer and the plate's copy to the original —
    see "Findings: the top bar, the footer and the copy".

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

## Findings: the top bar, the footer and the copy (2026-08-15)

With the frontispiece back, three things still read as somebody else's site.
All three were structural, not styling, and all three are now the original's.
The live markup they were checked against is in this document's history — fetch
`https://siliconvalleydsa.org/` and read `.top-bar`, `.svdsa-frontispiece` and
`footer.footer` if it needs doing again.

**The plate's copy is a page body, not frontmatter.** This is the finding the
rest followed from. On the original, everything inside the plate — the wordmark,
the rule, the three paragraphs — is the Welcome page's `entry-content`:

```html
<div style="text-align:center">
  <h1><code>Silicon Valley</code></h1>
  <h1>Democratic Socialists of America</h1>
</div>
<hr />
<p>
  …run <strong>democratically</strong>… We're <em>not</em> a political party…
</p>
<p>Come join us…, all while <strong>building community</strong>…</p>
<p>
  …one of our <strong><a>events</a></strong
  >! … <strong>Solidarity Forever!</strong>
</p>
```

So `content/pages/home.md` has a body now, and the plate renders it with the
same `<Prose>` every other page uses. Consequences worth knowing:

- `HomeCopy` lost `kicker`, `headline`, `headlineTwo` and `lead` — ten slots
  remain, all headings and button labels. `HOME_HTML` (app/lib/home.ts) is the
  body, and deliberately has **no default**: a fallback for a page of prose is
  how home.md went missing unnoticed once already.
- `build-content.ts` emits `html` into `home.json`; nothing else changed in the
  pipeline, because home.md was always read by the same `readCollection`.
- The wordmark is the document's own `h1`/`h2`. The monospace is why the
  markdown says `` # `Silicon Valley` `` — a code span, exactly as the original
  wraps it in `<code>`. Ours demotes the second line to `h2`; the original ships
  two `h1`s.
- **The editor gained tabs.** home.md is no longer body-less, so `Page`,
  `Rich text` and `Source` all apply; `Page` is the default and there is no
  `Preview` (Page is a better one). The plate in the `Page` pane re-renders from
  the unsaved body through the site's own `renderMarkdown`, debounced.
- **A trust boundary moved.** The home pane's iframe is same-origin and runs
  scripts, which was safe while the page was React components over plain
  strings. It now renders `rehype-raw` output, so `inertHtml` strips scripts,
  framed content and `on*` handlers before it goes in. That guard is for the
  editor only — the site renders the same markdown unfiltered, as it does every
  other page.

**The top bar** is one line beside the rose (`public/dsa-rose-mark.svg`, pulled
from the chapter's theme — see `public/README.md`), and Donate and Join DSA are
plain links rather than an outline/red button pair. `NAV` now nests one level:
Working Groups and Committees are lists inside About, and Donate opens Monthly
Local Dues + DSA Merch. `NavGroup.children` therefore holds `NavLink | NavGroup`
and the Header renders it recursively; second-level menus fly out sideways, and
flip to the left below 78rem so the right-hand ones don't open off-screen.

**The footer** is the accounts and the newsletter, full stop: circular black
buttons (red on hover) with inline SVG glyphs, a large red "Sign up for our
newsletter!" opposite them, and the copyright. The four link columns are gone —
the live site has never had them, and they were a second, quietly diverging copy
of the nav two feet above. Glyphs are paths in `app/components/SocialIcon.tsx`
keyed by the `label` in `socials.yaml`, with an initial-in-a-circle fallback so
a newly added account is never a blank button.

### Known gaps against the original

- The original's second wordmark line is an `h1`; ours is an `h2`, so the page
  has one `h1`. Deliberate.
- The original's top bar has no `/about/` link at all — About is `href="#"`,
  purely a menu. Ours links to the About page and marks the menu with a caret.
- Working-group emoji show in the menus, as they do on the original, but the
  original also has them in a different order (alphabetical); ours follows
  `navigation.yaml`.

## Findings: editor integration (branch-as-draft)

- `red` now holds the WYSIWYG editor: a **separate `svdsa-edit` Worker**
  (`editor/`), editable config extracted to `content/config/*.json`, and
  `setup:editor` tooling. Spec: `plans/svdsa-wysiwyg-phase0.md`.
- **Model = branch-as-draft.** No separate "editor branch." Each edit session
  commits to a throwaway `draft/<editor>/<slug>` branch **off `red`** (authored
  as the editor via a bot credential); Workers Builds deploys it to a preview
  URL; **publish = merge the draft branch into `red`**.
- **Coupling:** the editor's base is `red`. So editors edit/publish against
  `red`, not `theme/faithful`. For the editor to operate on the new design,
  the reskin must **land on `red`** (merge). The actual merge is Cameron's call.
- **This branch is no longer trivially mergeable.** It owns hero content
  (`content/pages/home.md`), the slot set (`app/lib/home.ts`), the nav shape
  (`app/lib/site.ts`), the Header and the Footer. Expect real conflicts in all
  of those, and resolve toward whichever front page `red` ends up with.

## Things not to do

- Don't break the shared class vocabulary the content/calendar/event/prose
  routes rely on (`.card`, `.btn`, `.prose`, `.event-row`, `.nav`, `.section`).
- No `title=` tooltips (global rule).
- Don't touch infra/deploy.
