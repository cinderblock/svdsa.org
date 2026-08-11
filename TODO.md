# Open work

The one place to look for "what's outstanding". Everything the repo knows it
still owes, in one list.

**This is an index, not a spec.** Each entry is one line of what, plus a pointer
to where the real detail lives — a plan doc in `plans/`, or a file and line.
Detail belongs there, not here; duplicating it just gives us two versions to
disagree with each other. Adding work means adding a line here _and_ writing the
detail somewhere it can be read properly.

Counts are measured, not remembered, and stamped with the date they were taken —
so a stale number is visible as stale rather than quietly wrong. The command that
produced each one is given; re-run it rather than trusting the figure.

---

## Blocked on Cameron

Nothing here can be finished by a code change alone.

> All Cloudflare infrastructure is currently on the SVDSA **test** account
> (`4ce5029d216dd48d4516b29665d12e5a`), moving to the chapter's real account
> once they approve. Account ID, hostnames, Access team domain, AUD and policy
> ID are all account-scoped and will change with it — so keep them in
> `editor/wrangler.jsonc` vars and `bun run setup:editor`, not in source.

- [ ] **The editor does not verify who it is talking to.**
      `REQUIRE_ACCESS: "false"` in `editor/wrangler.jsonc:38` makes the Worker
      trust the `Cf-Access-Authenticated-User-Email` header, which is a plain
      forgeable header, and fall back to a default identity when it is absent.
      As of 2026-08-11 a Cloudflare Access application **is** live in front of
      `edit.cameron-test-svdsa.workers.dev`, so the ordinary URL is gated at the
      edge — but an Access application is scoped to exact hostnames, and a
      Worker is reachable on more than one. A version-preview hostname
      (`<version>-edit.<subdomain>.workers.dev`) does not match that
      destination, reaches the Worker directly, and is then trusted. Edge
      gating and Worker verification are not substitutes for each other.
      **To close:** set `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` and delete
      the `REQUIRE_ACCESS` line — `bun run setup:editor` does all three. The
      editor shows a red banner until then.
      → `editor/src/access.ts` header comment; `editor/README.md` § "Open, and
      needs the chapter"
- [ ] **Working-group emoji were guessed.** Ecosocialist, Healthcare and
      Socialist Feminist weren't in the chapter's list, so placeholders shipped.
      Electoral is described by the chapter as a working group but sits under
      committees in `navigation.yaml`. → `plans/svdsa-editor-rich-ui.md`
      § "Open for the chapter"
- [ ] **There is no general contact form**, only an email address. The thing
      that looked like one was the HGO Grievance Form. If the chapter wants a
      contact form, it needs creating. → same section
- [ ] **Three phase-shifting series have unconfirmed dates beyond ~2027-04.**
      Their known deviations are recorded as EXDATE/RDATE up to then; after
      that they generate clean biweekly dates no working group has agreed to.
      → `plans/svdsa-editor-rich-ui.md` § "Known gaps after round 5"

## Content

- [ ] **328 unaccented "San Jose" and 112 style warnings.** House style is
      _San José_. `bun run lint:content --fix` is mask-aware (it won't touch
      slugs, code spans or link targets) but also rewrites venue names in
      frontmatter, so it wants a human decision before a corpus-wide run.
      Measured 2026-08-11 via `bun run lint:content`.
- [ ] **17 files still carry raw block HTML, 13 carry styled spans** — Canva
      iframes, an ActionNetwork embed, a Mailjet form, an iatspayments script,
      styled divs. These render in Preview but not in Rich text, so a
      WYSIWYG-only member cannot edit those pages. Measured 2026-08-11 via
      `grep -rlE '^<(div|iframe|script|form|style|table)' content --include=*.md`.
      → `plans/svdsa-editor-wysiwyg-fidelity.md`

## Editor

- [ ] **Rich text doesn't look like the real page**, and has no honest way to
      show raw HTML — so Preview is a necessity rather than a confirmation.
      Includes the two open questions on how far to take it.
      → `plans/svdsa-editor-wysiwyg-fidelity.md`
- [ ] **Image upload.** The initial payload is the WordPress uploads that didn't
      survive the migration. → `editor/README.md` § "Next"
- [ ] Spellcheck with a chapter dictionary; structured forms over the config
      YAML; a diff before publishing; delete. → same section
- [ ] A GitLab adapter, for the gitlab.com move. → same section
- [ ] **Monaco ships as the full barrel (~1.5 MB gzip).** Lazy-loaded, so it
      isn't in the initial payload, but it could be markdown-only once
      monaco 0.56's language layout settles.
      → `editor/web/editors/monaco-setup.ts:11`

## Infrastructure

- [ ] **No scheduled rebuild.** `.github/workflows/` has only `ci.yml`. This is
      a freshness optimization, not a correctness one — the calendar expands
      recurrence rules against the reader's clock, so it cannot go stale
      without one (there's a regression test that sets the clock to 2099).
      Verified 2026-08-11.
- [ ] **Redirects are partial.** Only the obvious archive redirects are in
      `public/_redirects`; a full export from the WordPress Redirection plugin
      needs WP admin. → `plans/svdsa-static-rebuild.md` § "Remaining before/at
      deploy"

## Larger, not started

- [ ] **Multilingual site.** Member-written translations, never machine
      translation, with the site picking per visitor and degrading when a
      translation is missing. Has open questions for you.
      → `plans/i18n.md`

---

## Where the plans live

| Doc                                      | What it covers                                        |
| ---------------------------------------- | ----------------------------------------------------- |
| `plans/svdsa-static-rebuild.md`          | WordPress → static React on Cloudflare Workers        |
| `plans/svdsa-wysiwyg-phase0.md`          | The editor's backend, auth and draft/PR model         |
| `plans/svdsa-wysiwyg-editing.md`         | Editing design decisions                              |
| `plans/svdsa-editor-rich-ui.md`          | The three-mode editing surface, round by round        |
| `plans/svdsa-editor-branches.md`         | Branch browser and the top bar                        |
| `plans/svdsa-editor-wysiwyg-fidelity.md` | Making Rich text trustworthy on its own (not started) |
| `plans/svdsa-home-inplace-editing.md`    | Editing the home page by typing on it                 |
| `plans/calendar-recurrence-restore.md`   | Recovering the rules the WXR re-import dropped        |
| `plans/i18n.md`                          | Multilingual site (not started)                       |

Each plan doc carries its own **Things not to do** section — traps already paid
for. Read the one for your area before starting; that's where the negative
results are, and they're the expensive part to rediscover.
