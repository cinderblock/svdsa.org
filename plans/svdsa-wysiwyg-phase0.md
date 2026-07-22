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

## Infra shopping list (each staged for Cameron's per-change authorization)

None created yet. When we start Phase 2, authorize individually:

1. **Cloudflare Access** application on the edit domain + a policy allowing the
   chapter editors' emails (email OTP / Google). Free Zero Trust tier (≤50 users).
2. **Git-host bot credential**, scoped to `cinderblock/svdsa.org`, able to push
   branches + open PRs/MRs:
   - now: a **GitHub App** (installable, scoped, revocable), or
   - later: a **GitLab project access token / OAuth app** (gitlab.com).
     Stored as a Worker secret; never in the repo.
3. **`svdsa-edit` Worker** + a `*.workers.dev` domain (custom domain later).
4. (Already specced separately) the daily-rebuild **Cron Trigger Worker +
   deploy hook** — independent of the editor.

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

---

Plan path: `plans/svdsa-wysiwyg-phase0.md`
