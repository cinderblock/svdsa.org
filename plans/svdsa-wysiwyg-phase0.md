# SVDSA WYSIWYG — Phase 0 Design Spec (branch-as-draft)

The concrete design for the in-browser editor. Supersedes the **D1 draft layer**
in `plans/svdsa-wysiwyg-editing.md`: **drafts are git branches, not a database.**
Everything else in that plan (separate edit Worker, Cloudflare Access, publish =
commit, scope = content only) still holds.

Related: `plans/svdsa-static-rebuild.md` (base build), `plans/svdsa-wysiwyg-editing.md`
(original plan).

## Goal (recap)

Let a few chapter editors — **who do NOT have git-host accounts** — edit site
content in a browser. Git stays the single source of truth and every edit is a
real, attributed commit. Production stays a pure static-assets Worker.

## Core idea: a draft **is** a branch

- Each edit session writes to a **draft branch** (e.g. `draft/<editor>/<slug>`)
  off `red`, committed by a **bot credential but authored as the editor**.
- Workers Builds already deploys every branch to
  `https://<branch>-svdsa.isozilla.workers.dev/` → that **is** the preview
  (the real, fully-built site — no separate preview renderer to maintain).
- **Publish** = merge the branch into `red` (or open a Merge Request for review).
- "Drafts" = the set of open `draft/*` branches / MRs. **No database.** All
  state (who, when, what) is git commit + branch + MR metadata.
- For instant typing feedback, the editor renders a **client-side preview** in
  the app using the real render components; the branch build is the shareable /
  authoritative preview.

Why this beats a D1 draft store: no schema, no draft-vs-commit conflict logic
beyond git's own, no extra infra to provision/authorize, and the preview can't
drift from production because it _is_ production on another branch.

## Architecture

Two deployables, one repo:

1. **Production `svdsa`** (unchanged) — static assets only, source of truth =
   `content/**` on `red`. Deploy = a commit to `red` → Workers Builds.
2. **Editor `svdsa-edit`** (new, separate Worker + domain) — server code.
   - **Cloudflare Access** in front → editors sign in with email/Google (no git
     account). Access passes a signed JWT (`Cf-Access-Jwt-Assertion`) carrying
     the editor's email/name.
   - The Worker verifies that JWT, then does all git work through the **bot
     credential** via the host adapter, **authoring commits as the editor**.
   - Reads current content live from the git host (so it's always current
     regardless of last prod build); writes go to a draft branch.
   - Editor UI (framework TBD in Phase 2/3) lists collections, edits typed
     frontmatter + body, saves (→ commit to draft branch), publishes.

Same repo so the editor can import the app's real render components for the
client-side preview, and share the content schema.

## Editing lifecycle

1. Editor signs in (Cloudflare Access) → Worker knows `{ email, name }`.
2. Editor picks an item (or "new") → Worker `readFile` from `red`.
3. On save → `ensureBranch(draft/…)` + `commitFile(…, author: editor)` →
   Workers Builds publishes a preview URL for that branch.
4. Editor reviews the real preview; iterates (more commits to the same branch).
5. **Publish** via the configured `PublishTarget`:
   - direct: `merge(branch → red)` → production rebuild, or
   - review: `openChangeRequest(branch → red)` → a human merges the MR.
6. Branch deleted on merge; the draft is "gone" because the branch is gone.

## Interfaces (contracts to implement in Phase 2)

Host-agnostic so the GitHub→GitLab (gitlab.com) move is one adapter swap.

```ts
// Identity comes from the verified Cloudflare Access JWT — no passwords here.
interface Editor {
  email: string;
  name: string; // display name → git commit author, for attribution
}

// One editable content item = one Markdown file under content/.
interface EditableItem {
  collection: "pages" | "posts" | "events" | "config";
  path: string; // repo-relative, e.g. content/posts/2026/2026-05-02-….md
  frontmatter: Record<string, unknown>;
  body: string; // Markdown/HTML body
  sha?: string; // git blob sha at load time → optimistic concurrency
}

// A draft is a branch. Metadata is derived from git; there is no DB.
interface Draft {
  branch: string; // e.g. draft/<editor-slug>/<item-slug>
  base: string; // usually "red"
  item: EditableItem;
  previewUrl?: string; // <branch>-svdsa.<sub>.workers.dev once built
  updatedBy: string; // editor email
  updatedAt: string; // ISO
}

// Host-agnostic git operations. GitHub implementation now; GitLab (gitlab.com)
// later — same contract, different API client.
interface GitHostAdapter {
  readFile(path: string, ref?: string): Promise<EditableItem | null>;
  listFiles(dir: string, ref?: string): Promise<string[]>;
  ensureBranch(branch: string, fromRef: string): Promise<void>;
  listBranches(prefix?: string): Promise<string[]>;
  // Commits with the editor as AUTHOR (attribution) while the bot is committer.
  commitFile(args: {
    branch: string;
    path: string;
    contents: string; // serialized frontmatter + body (gray-matter)
    message: string;
    author: Editor;
    baseSha?: string; // optimistic concurrency; reject if changed
  }): Promise<{ commitSha: string }>;
  openChangeRequest(args: {
    branch: string;
    base: string;
    title: string;
    body?: string;
  }): Promise<{ id: string; url: string }>; // GitHub PR / GitLab MR
  merge(args: {
    branch: string;
    base: string;
    method?: "merge" | "squash";
  }): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
}

// Publish is pluggable: which mode is default / who may use it is a chapter
// GOVERNANCE decision, deferred — the code must support both behind one contract.
interface PublishTarget {
  publish(
    draft: Draft,
    editor: Editor,
  ): Promise<{ mode: "merged" | "requested"; url: string }>;
}
```

Serialization must round-trip the exact on-disk format: YAML frontmatter + body
via `gray-matter` (same as `scripts/fetch-wp-content.ts` produced). The editor
reads/writes the **`.md` source**, never `content/generated/*.json`.

## Attribution

Commits are made with the bot credential as _committer_ but the **editor as
author** (`author.name` / `author.email` from the Access identity). `git log`,
GitHub/GitLab, and MRs then show _who_ changed _what_, without the editor
needing repo access or a git-host account.

## Branch naming

`draft/<editor-slug>/<item-slug>` — editor-slug from the Access email
(local-part, sanitized), item-slug from the content path. One branch per item
per editor keeps previews stable and merges small. `listBranches("draft/")`
enumerates open drafts.

## Git host implementations (GitHub **and** GitLab)

One `GitHostAdapter` interface, two concrete implementations chosen at runtime
by config (`GIT_HOST=github|gitlab`). Both hosts support every operation we
need, including **commit-author override** (so the editor is the author while
the bot is the committer). Endpoint mapping:

| Adapter method      | GitHub REST                                                                                       | GitLab REST (gitlab.com)                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `readFile`          | `GET /repos/{o}/{r}/contents/{path}?ref` (base64 + `sha`)                                         | `GET /projects/{id}/repository/files/{path}?ref` (base64 + `blob_id`)                                           |
| `listFiles`         | `GET /repos/{o}/{r}/git/trees/{ref}?recursive=1`                                                  | `GET /projects/{id}/repository/tree?path&ref&recursive=true&per_page=100`                                       |
| `ensureBranch`      | `POST /repos/{o}/{r}/git/refs` (`refs/heads/…`, `sha`)                                            | `POST /projects/{id}/repository/branches?branch&ref`                                                            |
| `listBranches`      | `GET /repos/{o}/{r}/branches`                                                                     | `GET /projects/{id}/repository/branches?search`                                                                 |
| `commitFile`        | Git Data API (blob→tree→commit with `author{}`) or `PUT …/contents/{path}` (`author`+`committer`) | `POST /projects/{id}/repository/commits` (`branch`, `actions[]`, `author_name`, `author_email`, `start_branch`) |
| `openChangeRequest` | `POST /repos/{o}/{r}/pulls` (`head`,`base`,`title`)                                               | `POST /projects/{id}/merge_requests` (`source_branch`,`target_branch`,`title`)                                  |
| `merge`             | `PUT /repos/{o}/{r}/pulls/{n}/merge`                                                              | `PUT /projects/{id}/merge_requests/{iid}/merge`                                                                 |
| `deleteBranch`      | `DELETE /repos/{o}/{r}/git/refs/heads/{branch}`                                                   | `DELETE /projects/{id}/repository/branches/{branch}`                                                            |

**Auth (the "app" credential), per host:**

- **GitHub** — a **GitHub App** installed on the repo. Permissions: Contents
  read+write, Pull requests read+write. The Worker mints short-lived
  installation tokens from the App's private key (stored as a Worker secret).
  Revocable per-install; commits attributed via the `author` field.
- **GitLab (gitlab.com)** — a **project access token** (or group token) with
  scope `api` (or `write_repository` + MR via `api`), sent as `PRIVATE-TOKEN`
  / `Authorization: Bearer`. Simplest bot credential; rotate/revoke in project
  settings. For per-editor OAuth instead of a shared bot, a **GitLab OAuth
  application** also works (and is self-host-portable), but the project token
  is the least-moving-parts fit and attribution still comes from
  `author_name`/`author_email`.

**Auth-agnostic pieces (identical on both hosts):** Cloudflare Access identity,
branch-as-draft flow, `PublishTarget`, gray-matter serialization, and the
Workers Builds branch previews (Workers Builds connects to github.com **and**
gitlab.com). Only the adapter class + the credential type differ.

## GitHub → GitLab migration (when the chapter moves to gitlab.com)

Short, because the design was built for it:

1. Create/mirror the repo on **gitlab.com** (project under the DSA group),
   preserving branches (esp. `red`) and history.
2. **Workers Builds:** connect the GitLab project (dashboard) — same build
   command, production branch `red`, branch previews and MR status comments
   work as on GitHub. Re-create the **deploy hook** (daily rebuild) for the new
   project; the Cron Trigger Worker just points at the new hook URL.
3. **Bot credential:** create a GitLab project access token; set it + `GIT_HOST=gitlab`
   as `svdsa-edit` Worker secrets. Retire the GitHub App.
4. **Editor code:** flip the adapter selection to the GitLab impl. No changes to
   the UI, the draft/branch model, publish logic, or Cloudflare Access.
5. **Cloudflare Access:** unchanged (identity is independent of the git host).
6. CI: the `.github/workflows/ci.yml` checks become a **GitLab CI** pipeline
   (`.gitlab-ci.yml`) running the same `fmt/typecheck/test/build`. (Deploy still
   flows through Workers Builds, so CI stays checks-only.)

What does NOT change: content model, the static site, the branch-as-draft
editor, attribution, Access. The migration is "swap the adapter + reconnect
Workers Builds," not a rebuild.

## Infra shopping list (each staged for Cameron's per-change authorization)

None created yet. When we start Phase 2, authorize individually:

1. **Cloudflare Access** application on the edit domain + a policy allowing the
   chapter editors' emails (email OTP / Google). Free Zero Trust tier (≤50 users).
2. **Git-host bot credential** (the "app"), scoped to the repo, able to push
   branches + open PRs/MRs. Selected by `GIT_HOST` config:
   - **github** (now): a **GitHub App** (Contents + PRs read/write; Worker mints
     installation tokens from the App private key).
   - **gitlab** (target, gitlab.com): a **project access token** (scope `api`),
     or a GitLab OAuth app for per-editor auth.
     Stored as a Worker secret; never in the repo. See "Git host implementations".
3. **`svdsa-edit` Worker** + a `*.workers.dev` domain (custom domain later).
4. (Already specced separately) the daily-rebuild **Cron Trigger Worker +
   deploy hook** — independent of the editor.

## Credential & Access specifics (execute at Phase 2 start — Cameron)

Exact settings so the bot credential + auth can be created quickly. None exist
yet; each is a per-change authorization.

**GitHub App (now):**

- Repository permissions: **Contents: Read & write**, **Pull requests: Read &
  write**, **Metadata: Read** (required). No webhook needed.
- Install on **`cinderblock/svdsa.org`** only. Generate a **private key**.
- `svdsa-edit` Worker secrets: `GH_APP_ID`, `GH_INSTALLATION_ID`,
  `GH_PRIVATE_KEY`. Worker mints short-lived installation tokens from these
  (`POST /app/installations/{id}/access_tokens`).

**GitLab project access token (at gitlab.com migration):**

- Project → Settings → Access Tokens. Scope **`api`**. Role: **Developer** is
  enough for draft branches + opening MRs; **Maintainer** only if we enable
  direct-merge to a protected `red` (governance choice). Set an expiry +
  rotation reminder.
- Worker secrets: `GITLAB_TOKEN`, `GITLAB_PROJECT_ID`, plus `GIT_HOST=gitlab`.

**Cloudflare Access (both hosts — identity is git-host-independent):**

- Zero Trust → Access → Applications → **Self-hosted**, domain = the edit
  domain (start `svdsa-edit.isozilla.workers.dev`). Identity: **One-time PIN
  (email)** and/or **Google**. Policy: **Allow**, Include = the editors'
  emails (or an email domain). Free tier ≤ 50 users.
- The Worker verifies `Cf-Access-Jwt-Assertion` against the team's public keys
  (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), checking the
  app **AUD**. That JWT yields `{ email, name }` for attribution.

## Editor access model (resolved)

- **Editors bring their own account.** Enable multiple IdPs on the Access app
  (Google, GitHub, Microsoft, generic OIDC); the login screen offers a picker,
  and passkeys/2FA ride on whichever IdP the editor uses. No OTP tokens emailed.
- **Authorization = a Cloudflare Access Group** named e.g. "SVDSA editors"
  holding the editors' emails; the app policy is `Allow, Include = that group`.
  Adding/removing an editor = editing that one group in the dashboard.
- The Worker trusts the **Access-issued JWT / injected email** regardless of
  which IdP was used — Access enforces the group policy _before_ issuing its
  token (iss = team domain, aud = app), so no per-IdP logic in our code.

## Governance (defer to the chapter)

- Who may **direct-merge to `red`** vs must **open an MR**? Encode as
  `PublishTarget` config + Access group, not hard-coded.
- Which collections are editable by whom (e.g. bylaws vs blog).

## Not decided here (Phase 2/3)

- Editor UI framework and the field forms per collection (pages/posts/events,
  incl. event start/end/venue/virtual/categories).
- Media uploads (R2 or `public/` commit) + the member-photo consent gate.
- Converting WP-HTML bodies → clean Markdown for nicer rich-text editing.

## Progress log

- 2026-07-21: Phase 0 spec written. Branch-as-draft (no D1) confirmed; interfaces
  drafted (GitHostAdapter, PublishTarget, Editor, Draft, EditableItem);
  Cloudflare Access as identity; bot-authored-as-editor attribution; infra
  shopping list enumerated (unbuilt, awaiting per-change auth). Phase 1 (config
  extraction to content/config/) already shipped on `red`.
- 2026-07-21 (GitLab pass): added concrete dual-host adapter mapping (GitHub +
  GitLab REST per method), per-host auth (GitHub App vs GitLab project access
  token / OAuth), and a GitHub→gitlab.com migration checklist. Only the adapter
  class + credential differ; identity/draft/publish/Access are host-agnostic.

---

Plan path: `plans/svdsa-wysiwyg-phase0.md`
