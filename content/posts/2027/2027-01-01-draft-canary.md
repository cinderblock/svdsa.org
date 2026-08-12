---
id: 90000001
slug: draft-canary
path: /2027/01/01/draft-canary/
title: DRAFT CANARY — this post must never appear on the site
date: '2027-01-01T00:00:00'
modified: '2027-01-01T00:00:00'
excerpt: >-
  A permanent fixture, not real content. It exists so that any regression in
  draft handling fails a test instead of publishing someone's unfinished work.
categories:
  - Uncategorized
tags: []
draft: true
---

This post is a **test fixture**. It carries `draft: true`, so
`scripts/build-content.ts` must drop it before it reaches any output: the blog
index, `sitemap.xml`, the prerendered pages, or the generated JSON.

`tests/drafts.spec.ts` asserts it is absent from all of them. If you are reading
this on the live site, draft handling is broken and something unpublished has
been made public — that is the whole point of this file.

Do not delete it, and do not remove the `draft: true`.
