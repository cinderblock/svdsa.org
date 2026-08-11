# Restore the recurring-event rules lost in the WXR re-import

## Goal

`red` has lost all 21 recurring-meeting definitions. Put them back, plus the two
draft canaries and the home-page copy, and get the test suite green again.

This is a **content recovery job, not a redesign**. Everything needed is already
in git history. Expect ~10 minutes plus a test run.

## What is broken

A repeating meeting on this site is **one file carrying an iCalendar recurrence
rule** (`content/events/<slug>.md` with a `recurrence:` block). Occurrences are
derived, never stored. `app/lib/recurrence.ts` expands them in the build, in the
browser, and in the `.ics` feeds. Two consequences the README calls out
explicitly: the calendar cannot go stale, and calendar subscriptions keep
generating occurrences indefinitely rather than running out at the build horizon.

**All 21 of those files are gone**, along with both permanent draft canaries and
the home-page copy.

Measured on `red` (2026-08-10):

|                                      | expected  | actual |
| ------------------------------------ | --------- | ------ |
| Files with `recurrence:`             | 21        | **0**  |
| Series files (`content/events/*.md`) | 21        | **0**  |
| `events-series.json` entries         | 21        | **0**  |
| Upcoming events                      | ~154      | **24** |
| `content/generated/home.json`        | populated | `{}`   |
| Draft canaries                       | 2         | **0**  |

Visible symptoms: `/event/<slug>/` series pages are dead, the calendar shows 24
upcoming events instead of ~154, `.ics` subscribers stop receiving meetings, and
the home page silently falls back to the shipped `DEFAULTS` in
`app/lib/home.ts:32-48` instead of its real copy.

**Not yet deployed.** `origin/red` is still at `3184766`, which predates the
damage. The problem lands the moment someone pushes `red`.

## Why it happened

Commit `b34baca` ("content: re-import from the WordPress WXR export") is an
ancestor of `red`. It touched only `content/`, `public/media` and `.gitignore` —
no scripts.

The importer itself is **not at fault and is not in this repo**. It lives in
WebPress (`~/git/Personal Projects/WebPress`, branch `master`) as
`scripts/wxr.ts` + `scripts/import-wxr.ts`, is non-destructive by design (no
`rm()` anywhere; `--out <dir>` exists to preview without touching real content),
and simply has **zero recurrence support** — `grep -n
"recurrence\|RRULE\|rrule\|EventRecurrence"` over both files returns nothing.

The loss came from **landing that output by wholesale-replacing**
`content/{pages,posts,events}`. That removed everything the importer does not
produce: the hand-authored recurrence rules, the canaries, and the home copy.

`b34baca`'s actual content improvements are real and worth keeping — raw
`post_content` instead of `wptexturize`d `content.rendered`, ~595 curly quotes
normalized, media rehosted under `/media/`, and 278 fewer redundant event files
because the REST import's expanded instances were correctly dropped.

## The fix

Base commit for recovery is **`3184766`** (= `origin/red`, the commit
immediately before `b34baca`).

```sh
git checkout 3184766 -- \
  $(git ls-tree -r --name-only 3184766 content/events/ \
     | grep "^content/events/[^/]*\.md$") \
  content/posts/2027/2027-01-01-draft-canary.md \
  content/events/2027/draft-canary-event.md \
  content/pages/home.md
```

That is **24 files**: 21 series + 2 canaries + `home.md`.

Then lower one stale threshold in `tests/new-item.spec.ts:144`:

```diff
-    expect(existing.size).toBeGreaterThan(500);
+    expect(existing.size).toBeGreaterThan(300);
```

Then:

```sh
bun run build:content
bun run test
```

## Two traps — read before starting

### 1. Do NOT restore `content/pages/index.md`

It is the **same WordPress page** as the newly imported `welcome.md` — both carry
`id: 17`. It was previously hand-relocated to `path: /`. Restoring it fails the
build immediately:

```
error: duplicate page id 17: "/" and "/welcome/" — change one item's slug so its id differs
```

It is superseded, not missing. The command above deliberately omits it. A naive
"restore everything `b34baca` deleted" will hit this.

### 2. The failing id test is a stale threshold, not a real collision

After restoring, `tests/new-item.spec.ts:128` fails with a name that reads like a
genuine id collision:

```
idForPath › does not collide with any id already in the corpus
```

It is not. The failing assertion is line 144, `expect(existing.size)
.toBeGreaterThan(500)` — a guard proving the corpus actually loaded so the real
collision checks on lines 145-146 mean something. The corpus legitimately shrank
to **376** ids because the WXR import dropped the REST-expanded duplicates. The
collision assertions never run. Lower the guard to `300`.

## Progress log

- [x] Restored the 24 files (21 series + 2 canaries + `home.md`) from `3184766`.
- [x] Lowered the stale `existing.size` guard in `tests/new-item.spec.ts` to 300.
- [x] `bun run build:content` — output matches the expected numbers exactly.
- [x] `bun run typecheck` and `bun run fmt:check` clean.
- [x] Full suite green: **483 passed** across chromium, firefox and webkit —
      twice in a row, since every failure here was a flake and one green run
      proves nothing.
- [x] Committed on `red`.
- [ ] Not pushed. `origin/red` is still at `3184766`; pushing is yours to do.

### The restore destabilised six tests, and fixing them was the real work

The restore itself was a two-minute checkout. What the plan did not anticipate
is that it **broke the test suite in a way `bun run test` had never shown**,
because the plan only ever measured chromium. Chromium was green throughout;
firefox and webkit were not.

Every failure had the same root cause: **the calendar got much heavier, and
several tests were asserting against it on the default 5-second timeout.**
Before the restore the calendar was 24 static cards. Now the browser expands the
recurrence rules on mount and the list grows **154 → 549 cards**, so first paint,
route compile and navigation all take substantially longer in the dev server.
The tests were not wrong about behaviour — they were racing it.

Diagnosis notes worth keeping:

- `tests/home.spec.ts` "calendar row links to an event detail page" is the
  **first test in the suite to reach `/event/$slug`**, so it alone pays Vite's
  cold compile for that route. React Router holds the URL back until the route's
  module and loader resolve, so the assertion saw `/calendar` and read exactly
  like a broken link. Every later `/event/` test finds the route warm — which is
  why the near-identical `.ics` test beside it kept passing and made the failure
  look nonsensical.
- Two of those tests also lacked the hydration barrier this file already
  documents elsewhere ("a click dispatched earlier would be dropped"); it is now
  a shared `calendarHydrated()` helper rather than a copy inside one test.
- `tests/wizard.spec.ts` had a genuine latent race, unrelated to content: two
  tests asserted on `created.draft` — an object filled in by a stubbed route —
  immediately after clicking, with no wait. The same file's other create test
  already waits for `.msg.ok, .path` first; the two stragglers now do too.

Fixes were deliberately kept to the repo's own existing idioms (`test.slow()`,
the `#main` visibility barrier, the `.msg.ok` barrier) rather than new
machinery. **No product code was changed** — the restore needed none.

### Verified stable, not just passing once

Because every one of these was a flake, a single green run proves nothing. The
previously-failing tests were re-run in a loop until the result was consistent:
`home.spec.ts` on firefox 6/6 green, then the full three-browser suite green
end-to-end. Counts vary run to run on a loaded machine (an early full run showed
385 passed with 77 webkit failures purely from another Playwright process
running concurrently in this same checkout) — so always confirm a green run.

### One pre-existing bug found, deliberately not fixed

`content/events/2026/2026-08-15-2026-08-15.md` ("August SJ NA4A Canvass",
id 16501) has an **empty slug**, so it publishes at the bare date URL
`/event/2026-08-15/` instead of `/event/<slug>/`. It comes from `b34baca`, not
from this restore, and it does resolve (the route matches on full pathname), so
it is cosmetic rather than broken. Left alone here because changing it changes a
public URL — worth a follow-up decision, not a silent edit.

## Testing trap that will waste your time

`playwright.config.ts:35` sets `reuseExistingServer: !process.env.CI` for both
web servers (site `:9999`, editor `:9998`). **If any svdsa dev server is already
listening, the suite silently attaches to it and tests that tree instead of
yours.** It then fails exactly as if the restore had not worked, while your own
`content/generated/events-series.json` plainly contains all 21 series.

Check before trusting any result:

```powershell
Get-NetTCPConnection -LocalPort 9999 | Select LocalPort,State,OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select CommandLine
```

If a server is running from a different checkout, either stop it or run with
`CI=1` (which disables reuse). Two full suite runs were wasted on this.

## Expected results after the fix

`bun run build:content` should report roughly:

```
build-content: 54 pages, 41 posts, 389 events (154 upcoming), 250 sitemap URLs
  skipped as draft: 1 posts, 1 events
```

The `skipped as draft` line is the canaries working again.

Three-way sanity check (verified in a scratch worktree, 2026-08-10):

|                           | pre-`b34baca` (`3184766`) | `red` broken | **after fix** |
| ------------------------- | ------------------------- | ------------ | ------------- |
| Pages / posts             | 54 / 41                   | 53 / 41      | **54 / 41**   |
| Event files               | 667                       | 259          | **389**       |
| Upcoming events           | 137                       | 24           | **154**       |
| `recurrence:` rules       | 21                        | 0            | **21**        |
| Duplicate upcoming events | 0                         | 0            | **0**         |

**The restored tree is strictly better than either.** It keeps `b34baca`'s wins
_and_ carries more upcoming events than the old tree ever had (154 vs 137),
because the WXR export is three weeks fresher than the July REST pull. Restoring
the rules does **not** duplicate the imported dated instances — verified by 0
exact `date + normalized-title` collisions; the 19 same-start-datetime groups are
genuinely different working groups meeting concurrently.

Test suite: chromium was **153 passed / 1 failed** before the threshold fix, the
single failure being the stale guard above. Expect green after.

## What this does NOT fix

Nothing in the pipeline distinguishes **content WordPress owns** from **content
this site owns**. Recurrence rules, canaries and home copy are site-owned, and a
future re-import landed the same way would delete them again.

That gap most likely belongs in WebPress (the generic engine), whose own
`plans/webpress-import.md` still lists "Land the svdsa.org re-import (awaiting
go-ahead)" as unchecked. It also matters for the planned multilingual layer — see
`plans/i18n.md` — because translation files are site-owned too and would be
destroyed identically.

Separately: **`bun run migrate` is now actively harmful.** It still points at the
obsolete REST importer `scripts/fetch-wp-content.ts`, which `rm -rf`s the three
content dirs at line 291 _and_ re-introduces the `wptexturize`d typography
`b34baca` exists to remove. Consider making it refuse to run.

Both are follow-up work, not part of this restore.

### The importer needs a recurrence feature — investigated 2026-08-11

The restore puts the data back but leaves the import **not idempotent**, which is
the property that actually matters: re-importing should be a no-op. Findings
from reading WebPress's `scripts/wxr.ts` and `scripts/import-wxr.ts`:

- **The recurrence data is already parsed.** `wxr.ts:112-116` copies every
  `wp:postmeta` key into `item.meta` with no allowlist, so TEC's
  `_EventRecurrence` is present on every run today. It is dropped at
  _conversion_ time — `wxr.ts:501-524` consumes about eleven `_Event*` keys and
  simply never reads that one. This is an emit gap, not a data gap.
- **`import-wxr.ts` never deletes anything.** It only `writeFile`s the paths it
  generates (`import-wxr.ts:97-101`). The `rm -rf` of `content/{pages,posts,events}`
  lives in the _old REST_ importer at `fetch-wp-content.ts:424-427` — i.e. behind
  `bun run migrate`. So the 21 files died from how the output was landed, not
  from the WXR importer itself. Correct the "Why it happened" section's emphasis
  accordingly.
- **Non-destructive alone would NOT give a no-op — it would give duplicates.**
  Series files live at flat `content/events/<slug>.md`; the importer writes
  `content/events/<year>/<slug>-<date>.md`. Different paths, so it would never
  overwrite a series file — it would add ~278 instance files _beside_ the 21
  series and every recurring meeting would appear twice. `deduplicate()`
  (`wxr.ts:393-408`) makes this worse by renaming collisions to `-2`, `-3`
  instead of merging. Recurrence support is genuinely required, not optional.
- One piece of recurrence semantics is already handled by accident: the
  `tribe-ignored` status is excluded (`wxr.ts:149-155`), and that is TEC's marker
  for deleted occurrences of a series.

So the feature is three parts: **collapse** instances into one series (TEC gives
recurring instances provisional ids ≥ 10,000,000 — `sjfreestore` is `10000996`),
**translate** `_EventRecurrence` (serialized PHP) into a rule, and **re-route**
the output to the flat series path so a re-import lands on the existing file.

Two things to settle before writing it:

1. **Schema.** svdsa uses `recurrence: { rrule: "FREQ=MONTHLY;BYDAY=3SA" }`
   (`app/lib/recurrence.ts:30-31`) and its parser implements only
   `FREQ=WEEKLY|MONTHLY`, _requiring_ an nth on monthly `BYDAY`
   (`recurrence.ts:107`). WebPress uses a different shape,
   `repeats: { freq, interval, byday, until }`
   (`plugins/events/expand-recurring.ts:17-23`). These have diverged and need
   reconciling, or the importer must emit whichever the site declares.
2. **Unrepresentable rules must fail loudly.** TEC's model does not map 1:1 onto
   RRULE (custom rules, per-instance exclusions, end-after-N-occurrences,
   same-date-monthly vs nth-weekday). Anything svdsa's parser can't express
   should error, not silently drop — silent dropping is how this whole incident
   started.

**Only 21 of the restored 24 files can ever come from the import.** The two
canaries carry synthetic ids (`90000001`) and `content/pages/home.md` has no WP
`id` at all — it is bespoke frontmatter (`kicker`, `headline`, `lead`, CTAs).
Those are genuinely site-owned and no importer feature will reproduce them, so
the merge/preserve backstop is still needed _in addition to_ recurrence support.
The two fixes solve different halves, and the i18n files land in the same
site-owned bucket.

**Acceptance test, and the reason to have restored first:** the 21 committed
files are now a golden oracle. Implement the feature, re-import with
`--out <tmp>`, and diff against them. An empty diff _is_ the no-op property.

**The export is at `~/Downloads/siliconvalleydsa.WordPress.2026-08-10.xml`**
(7.2 MB). Nothing is committed as a fixture — `wxr.test.ts` uses an inline
template literal with a single non-recurring event and no `_EventRecurrence`.

What the real export actually contains, measured 2026-08-11:

|                                      | count                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| `tribe_events` items                 | 305                                                           |
| real `_EventRecurrence` meta entries | **79**                                                        |
| …of those, carrying exclusions       | **8**                                                         |
| inner rule types                     | Weekly 64, Monthly 28, Date 19 (the Date ones are exclusions) |

79 rules against 21 series files — the rest are trashed / `tribe-ignored` / long
past, and the existing status filter should account for the gap, but that must be
proven against the oracle rather than assumed.

**Exclusions are the blocker, and they are real, not hypothetical.** A decoded
example — biweekly on Mondays, `end-type: On`, `end: 2025-12-31`, plus two
excluded dates:

```
rules:      type=Custom custom{interval:2, week.day:[1], type:Weekly}
            end-type:On end:2025-12-31
exclusions: date 2025-09-22, date 2025-11-17
```

svdsa's `Recurrence` is `{ rrule: string }` (`app/lib/recurrence.ts:30-31`) with
**no exclusion support at all**. Eight series cannot be imported faithfully until
the schema gains `EXDATE`/an `exclude:` list. This must not be papered over —
silently dropping exclusions would publish meetings that were cancelled.

### The importer's filename is separately wrong

`wxr.ts:505` writes `content/events/<year>/<slug>-<start-date>.md`, but the
WordPress slug **already carries the date**, so the date lands twice:
`2026-05-06-aceboardmeeting-2026-05-06.md`. **65 files** are like this. The URL
is unaffected (`path: /event/2026-05-06-aceboardmeeting/` is clean), so this is
filename-only cosmetics — but it does not match the convention documented at
`editor/src/content/newItem.ts:8-17`, which is `content/events/<year>/<slug>.md`
with the date already inside the slug.

Worth being precise about what is and isn't a design flaw here: series and
one-offs living at different paths is **correct**, because they are different
URLs — `/event/<slug>/` for a series that has no single date versus
`/event/<date>-<slug>/` for a one-off. That split is documented and was read off
the corpus, not invented. The bug is only the doubled date, plus the fact that
the importer has no concept of "series" and so can never write the flat path.

### The `rm -rf` should go

`scripts/fetch-wp-content.ts:291` deletes `content/{pages,posts,events}`
wholesale before re-fetching, and `bun run migrate` invokes it directly. It is
the obsolete REST importer, superseded by the WXR path, and it also re-introduces
the `wptexturize`d typography `b34baca` exists to remove. The WXR importer has no
`rm` anywhere, so this is isolated to a dead code path — which makes deleting it
or hard-failing it a cheap, safe win.

## Alternative considered

Reverting `b34baca` outright and re-landing it later through WebPress with a
merge-not-replace step. Rejected: it discards a commit whose content is
demonstrably good, and `b34baca` is now buried under several editor commits on
`red`, so reverting is more disruptive than restoring. Restore-in-place gets to
the same end state directly.

## Things not to do

- Don't restore `content/pages/index.md` (id 17 collision — see above).
- Don't "restore everything `b34baca` deleted" — most of those ~355 deletions
  were REST-expanded event instances the WXR import correctly replaced.
- Don't run `bun run migrate`.
- Don't trust a test run without checking nothing else is on `:9999`/`:9998`.
- Don't push `red` until the suite is green.
