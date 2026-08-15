# SVDSA editor — branch browser + top-bar redesign

Give the editor a place to **see every branch and open its preview**, and
replace the native `<select>` base picker with a control we own.

Companion to `plans/svdsa-editor-rich-ui.md` (the editing surface itself).

## Goal

Two connected problems with the editor's header today:

1. **Branches are invisible.** The base `<select>` lists names and nothing else.
   You cannot see which branch is production, when a branch last moved, whether
   it has diverged, whether it has an open PR, or — the thing people actually
   want — **the URL of its preview site**. Preview links exist only in the draft
   bar, and only for your own draft.
2. **The header uses default browser dropdowns.** A native `<select>` on a red
   band renders as an OS widget that ignores the app's palette, can't show
   two-line rows or per-item links, and looks out of place.

So: a **branch browser modal** listing every branch with its preview link, plus
a **custom branch switcher** in a redesigned top bar.

## Decisions already made (don't re-ask)

- **Modal dialog, not a page.** The editor SPA has no router (one `app.tsx`
  with `useState`), and the branch list is a thing you consult _while_ editing —
  a modal keeps the editing state mounted underneath. Deep-linkable via
  `?branches` so a link can open it.
- **The switcher is a reusable component.** Round 1 wired only the top bar;
  round 2 (below) adopted it for the file-list sort and wizard parent. The
  three recurrence dropdowns stay native on purpose — see round 2.
- **Branch rows show everything:** preview link, last commit (subject, author,
  relative time), ahead/behind vs production, open PR, and `draft/*` branches
  labelled with whose draft they are and what they branched from.
- **Native `<dialog>` + `showModal()`** for the modal — focus trap, Escape and
  the top layer come free and correct. The switcher popover is a plain
  absolutely-positioned div (the CSS anchor positioning the Popover API wants
  isn't portable enough yet).
- **`window.prompt` for new branches goes away** — the modal has a real form.
  Same `POST /api/branch` behind it.

## Environment / context

- Editor Worker `edit` (`editor/wrangler.jsonc`), separate from the site Worker
  `site`, both on the DSA test Cloudflare account.
- Preview URLs are derived, not stored: `previewUrl()` in `editor/src/index.ts`
  swaps the first host label for `<branch-alias>-<SITE_WORKER>`, so
  `theme/faithful` → `https://theme-faithful-site.<subdomain>.workers.dev/`.
- The Worker runs in workerd — **it cannot shell out to git**. Everything goes
  through the GitHub App REST/GraphQL client in `editor/src/git/github.ts`.
- Dev: `bun run editor:dev` (Vite, port 9998) proxies `^/api/` to
  `wrangler dev` on 8787. Playwright specs stub `/api/*` per-path.

## Plan / steps

1. [x] `github.ts`: `branchDetails(compareTo)` — one GraphQL round-trip for all
       branches (commit + PR + divergence).
2. [x] `index.ts`: `GET /api/branch-info` — adds `previewUrl` and draft
       ownership to each row.
3. [x] `api.ts`: `BranchInfo` type + `api.branchInfo()`.
4. [x] `picker.tsx`: reusable filterable popover picker (combobox pattern).
5. [x] `branches.tsx`: the modal.
6. [x] `app.tsx`: redesigned header wired to both; `?branches` deep link.
7. [x] `styles.css`: header, picker and modal sections.
8. [x] `tests/branches.spec.ts`; update `wizard.spec.ts`'s `header select`.
9. [x] README + `docs/editing.md`.

## Round 2 — the rest of the dropdowns (SHIPPED)

`Picker` grew a `filterable` prop and with it a second ARIA shape — **combobox**
when there's a filter box, plain focusable **listbox** when there isn't.
Enter/Escape now hand focus back to the trigger. It defaults to `true` and the
one genuinely short list (four sort orders) opts out; an earlier
`options.length > 8` default was dropped as a magic number that made the call
site's behaviour depend on how much content happened to exist.

Styling moved off "header only" to modifier classes — `pick--bar` for top-bar
chrome, `pick--block` to fill a form or sidebar slot — with the bare
`.pick__trigger` now a neutral in-app control. **A peer thread is making this
CSS more modular and is building on `pick--bar`; keep the modifier class and
don't re-scope it positionally (e.g. `#root > header`).**

Adopted at two more call sites: the sidebar's **sort** control
(`filelist.tsx`) and the wizard's **parent page** field (`wizard.tsx`).

**The three recurrence dropdowns stay native, deliberately.** Two-to-six short
options inside a dense form is where the platform control is genuinely better —
compact, already correct for keyboard and screen readers, and on iOS it gets a
wheel picker. The complaint that started this work was an OS widget on a red
bar; that doesn't apply inside a white form.

Both migrated call sites were `<label>`-wrapped selects and became `div` +
`aria-label`, because a `<label>` around the trigger `<button>` folds the
visible caption into the accessible name instead of labelling it — the exact
bug round 6 of `svdsa-editor-rich-ui.md` hit with the recurrence toggle.
`tests/picker.spec.ts` asserts the name is exactly `Sort content`.

## Findings / gotchas

- **`Ref.compare(headRef:)` is inverted from what you want.** The query asks
  each branch ref to compare _itself as the base_ against production as the
  head. So the branch's "ahead of production" count is the comparison's
  `behindBy`, and its "behind" is `aheadBy`. Doing it this way is worth the
  confusion: it fits in the same `refs` query, whereas comparing from the
  production ref would need the branch names first (two round-trips).
- **`Commit.associatedPullRequests` has no `states:` argument** (unlike
  `Repository.pullRequests`). Fetch a handful ordered by `UPDATED_AT` and pick
  the open one whose `headRefName` is this branch, else the newest.
- `RefOrder`'s only date field is `TAG_COMMIT_DATE`; it does order branches by
  their target commit date despite the name.
- The picker's filter input makes it a **combobox**, not a listbox — the input
  keeps DOM focus and drives selection through `aria-activedescendant`, so the
  options must be `id`'d and never focused directly.

## Not ours, but you will trip over it

**12 tests fail on this branch and none of them are about branches.** Verified
identical on a clean worktree at `b34baca` (the WXR re-import) with none of this
work applied, so they pre-date it:

- `feeds.spec.ts` — **zero recurring series in the corpus** (expects >10), no
  series carry EXDATE/RDATE exceptions, and the generated `.ics` files are
  empty (`public/calendar/committees.ics is empty`).
- `home.spec.ts` — the six calendar/recurrence tests that depend on those rules.
- `new-item.spec.ts` — only **353 ids in the corpus, where >500 is expected**.
- `drafts.spec.ts` — the draft canaries are no longer drafts.

Read together: the re-import appears to have written per-date event instances
again and lost round 5's collapsed `recurrence:` series. That is a real content
regression worth its own session — the editor's recurrence widget is fine, it
just has nothing to edit.

## Things not to do

- Don't make `/api/branches` itself heavy — it runs on every page load to fill
  the picker. The rich query belongs on `/api/branch-info`, fetched when the
  modal opens.
- Don't fake a spinner for build progress. A preview link that 404s for 90
  seconds after a push is better explained in copy.

  (Correction, 2026-08-14: the claim that "Workers Builds state isn't in the
  GitHub API" was wrong. Workers Builds posts a **check run** named
  `Workers Builds: site` — and `Workers Builds: edit` — on each commit, with a
  `conclusion` and a `details_url` pointing at the build log:
  `gh api repos/cinderblock/svdsa.org/commits/<sha>/check-runs`. That is the
  cheapest way to tell "this branch has no preview because its build failed"
  from "the build hasn't finished yet", and the branch modal could show it.)

- Don't let the modal own `base`. It calls back into `App`, which stays the one
  owner of the current branch.
