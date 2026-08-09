---
id: 90000002
slug: draft-canary-event
path: /event/draft-canary-event/
title: DRAFT CANARY — this event must never appear on the site
start: '2027-01-01 18:00:00'
end: '2027-01-01 19:00:00'
allDay: false
timezone: America/Los_Angeles
isVirtual: true
organizer: Silicon Valley DSA
categories:
  - SV DSA
draft: true
---

A **test fixture**, not a real meeting. Events reach more outputs than posts do —
the calendar, upcoming-events lists, the `.ics` subscription feeds, the sitemap —
so this one guards the surfaces the post canary can't.

`tests/drafts.spec.ts` asserts it appears in none of them. See
`content/posts/2027/2027-01-01-draft-canary.md` for the rationale.
