# Calendar: "today" is Los Angeles, and the past stays scrollable

## Goal

Two related defects on `/calendar`, reported in that order:

1. **The calendar was a day ahead.** From ~5pm Pacific onwards it showed
   tomorrow as today and hid events that were still hours away.
2. **Past events were evicted.** A meeting that happened this morning vanished
   by lunchtime, and the week/month grids rendered the earlier days of the
   current week as empty.

The fix for (2) then created a third requirement, stated explicitly by the user:

3. **A reader without JS must still land on the current week.** Extending the
   grid a month backwards is fine — but only once the browser can scroll-anchor.
   The static HTML must open on today, exactly as it did before.

## Environment / context

- `siliconvalleydsa.org` rebuild: React Router 7 framework mode, `ssr: false`,
  `prerender: true`, Bun, deployed as Cloudflare Workers Static Assets.
- Chapter is in Santa Clara County. Event frontmatter stores **Pacific
  wall-clock strings** — no offset, no zone.
- Main branch here is `red`. Design branches `theme/faithful` and
  `theme/midnight-rose` track it.
- The suite runs against the **dev server** (`playwright.config.ts` →
  `webServer`), not a built site. This matters — see Findings.

## Decisions already made (don't re-ask)

- **"Always use Los Angeles time for _everything_."** Not the reader's zone, not
  UTC, not a hard-coded offset.
- **Do not evict past events.** The calendar is a record of what the chapter
  does; what happened this morning is still the most useful row on the page.
- **The no-JS landing position is today.** JS is what buys scrollback, not the
  markup. This was decided after a first attempt shipped a lookback in the
  prerendered HTML and landed readers a month in the past.
- `CALENDAR_LOOKBACK_DAYS = 30`. Depth is a judgement call, not yet ruled on by
  the user.

## Design

`app/lib/today.ts` is the single place that decides what day it is:

- `chapterDay(at?)` — `Intl.DateTimeFormat` with an explicit
  `timeZone: "America/Los_Angeles"`. The only DST-correct way to do this; there
  is deliberately no offset arithmetic anywhere to get wrong twice a year.
- `isTodayOrLater(start, at?)` — string comparison, both sides already Pacific
  wall-clock.
- `shiftDay(day, n)` — calendar arithmetic on UTC midnights, so DST cannot
  shorten or lengthen a "day".
- `CALENDAR_LOOKBACK_DAYS`.

The build emits three event shapes rather than one:

| file                   | window             | consumed by                      |
| ---------------------- | ------------------ | -------------------------------- |
| `events-upcoming.json` | today → forward    | prerendered snapshot (home, cal) |
| `events-past.json`     | today−30 → today   | folded in only after hydration   |
| `events-full.json`     | today−30 → forward | `/event/` route detail           |

`app/routes/calendar.tsx` picks where the grids begin:

```ts
const todayDay = now ? chapterDay(now) : chapterDay();
const firstDay = now ? shiftDay(todayDay, -CALENDAR_LOOKBACK_DAYS) : todayDay;
```

`now` is `null` on the server and on the first client render (`useNow()`), so
the prerendered HTML and the hydration pass agree — no mismatch — and the
backward extension happens on the second render.

`app/components/CalendarViews.tsx` keeps the view still while that happens.
`useAnchorToday(from)` records today's `getBoundingClientRect().top` and, in a
layout effect keyed on `from`, `window.scrollBy`s by however much it moved.
Weeks get inserted above the viewport and the reader sees nothing shift.

**The list view is today-forward, unlike the grids.** It's an agenda and it
opens at the top, so a month of history there is a month of scrolling before
the reader reaches anything they can still attend — and, being a flat list, it
has no today marker to anchor to while it grows. The grids carry the lookback
because scrolling back through a week/month grid is a natural gesture and the
anchor holds today in view. Practical consequence: the default view is byte-for
-byte stable across hydration.

## Findings / gotchas

- **`toISOString().slice(0, 10)` is UTC.** That single idiom, in six places, was
  the whole of defect (1). It is invisible for two thirds of every day, which is
  why it survived. `tests/today.spec.ts` pins fixed instants (Pacific evening,
  winter evening, either side of local midnight) rather than reading the clock.
- **`+= 86_400_000` on a local `Date` is not "a day".** It repeats one day and
  skips another across the DST boundaries. `CalendarViews` now uses
  `new Date(y, m, d + n)`.
- **The dev server injects CSS through the JS bundle.** A JS-disabled page
  served by `react-router dev` is completely unstyled: `#main` sat at y=790
  without JS and y=65 with it. Every coordinate measured off a no-JS dev page is
  meaningless, and comparing offsets between the static and hydrated renders
  only works against a **built** site. This cost a full round of "the scroll
  anchor is off by 78px" debugging. The committed tests assert structure
  (does the first `.cal-week` contain `.is-today`? did `scrollY` move?) rather
  than pixels; the pixel invariant was verified by hand against `wrangler dev`
  (today's viewport top: 819 before hydration, 819 after, `scrollY` 2132).
- **`events-full.json` has to carry the lookback too.** Splitting the past out
  of `events-upcoming.json` silently broke every past card's detail page —
  clicking one landed on "This event isn't on the calendar". Caught by an
  existing test, not by the new ones. Those pages are prerendered as well
  (`react-router.config.ts`), so a link shared last week still opens without JS.
- **On the DEPLOYED site `?view=week` serves the list.** `/calendar` is
  prerendered once, with no query string, so a JS-less reader always gets the
  list view — the week/month grids only exist after hydration. That means the
  no-JS grid assertions in the suite are a dev-server property; what the built
  site actually guarantees is that the prerendered LIST starts at today
  (verified: earliest dated link in `build/client/calendar/index.html` is
  today's date). It also means the list, not the grid, is what a first-time
  visitor lands on — which is how the list's lookback got caught.
- **The list's lookback was the real regression.** With the past folded into
  `shown`, the default view hydrated into last month: 56 past events prepended
  above today, shoving the agenda down. Only visible against a **built** site,
  because under `react-router dev` the query string does select the week view
  and the list is never exercised cold. Measured before/after the fix: first
  agenda day now identical pre- and post-hydration (`Wed 19 Aug`, top =
  580.296875 px, `scrollY` 0).
- **Week and month chips are `a.cal-chip`, not `a.ecard`.** `.ecard` is the list
  view only. A test selecting `a.ecard` on `?view=week` silently finds nothing
  and passes vacuously.
- **Query strings don't vary prerendered HTML** — `/calendar?view=week` serves
  `/calendar`'s file. It works under `react-router dev` because dev re-renders
  per request; against the deployed site the view switch is client-side.
- The "N upcoming events" count jumps 148 → 499 on hydration. Not a bug: the
  snapshot covers the 90-day prerender horizon, the hydrated page expands the
  rules a year out. Noted because it looks like one.

## Progress log

- [x] `app/lib/today.ts` + `tests/today.spec.ts` (11 tests) — committed `59ba1bd`
- [x] Six UTC call sites converted, including `scripts/build-content.ts`
- [x] DST-safe day arithmetic in `CalendarViews`
- [x] Lookback window kept in the calendar, not evicted
- [x] Prerendered snapshot pinned to today-forward; past split into
      `events-past.json`, folded in by `expandEvents` after hydration
- [x] `useAnchorToday` scroll compensation
- [x] `events-full.json` and the prerender list extended back over the lookback
- [x] List view kept today-forward; grids carry the lookback
- [x] Four `Calendar scrollback` tests in `tests/home.spec.ts`
- [x] `format.ts` converts from Pacific explicitly; 14 tests in
      `tests/format.spec.ts` that pass in any runner timezone
- [x] Timezone picker + localStorage + day-shift marker; 6 tests in
      `tests/timezone.spec.ts`
- [ ] Commit, push `red`, mirror onto `theme/faithful` + `theme/midnight-rose`,
      redeploy

## Open questions for the user

1. **`app/lib/format.ts` still parses in the reader's timezone** —
   `new Date(s.replace(" ", "T"))` on a Pacific wall-clock string means a member
   reading from New York sees times shifted three hours. Directly contrary to
   "always use Los Angeles time for everything". Recommend fixing it with an
   explicit `timeZone` the same way `today.ts` does. Not done — not asked for,
   and it changes displayed times site-wide.
2. **Is 30 days the right lookback?** Deep enough to cover "what did I miss",
   shallow enough that the hydrated grid stays cheap. Easy to change — it's one
   constant.

## Things not to do

- Don't reach for `toISOString()` or `getFullYear()` to get "today" — import
  `chapterDay()`.
- Don't put the lookback back into `events-upcoming.json`; that is the file the
  static HTML renders from, and it defines where a JS-less reader lands.
- Don't assert pixel positions against the dev server's no-JS render.
- Don't verify calendar behaviour only under `react-router dev`. The query
  string selects a view there and doesn't on the deployed site, so the default
  (list) view goes untested exactly where it matters most.
- Don't add a window to one of the three event files without checking the other
  two — the calendar showing a card whose detail page doesn't exist is the
  failure mode.
- Don't use a `title=` attribute for the zone label, or for anything else. It
  is invisible on a phone, which is where this site is mostly read.
- Don't assume a zone id from memory when writing a picker test — check it
  against `Intl.supportedValuesOf("timeZone")` on the machine running it.
- Don't trust a Playwright run without checking nothing else holds `:9999`
  (`reuseExistingServer: !CI` will happily test another worktree's server).
