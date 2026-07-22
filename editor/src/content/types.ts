/**
 * Editor domain contracts (see plans/svdsa-wysiwyg-phase0.md).
 * Host-agnostic: the GitHub→gitlab.com move is one adapter swap.
 */

/** Identity from the verified Cloudflare Access JWT — used for commit author. */
export interface Editor {
  email: string;
  name: string;
}

export type Collection = "pages" | "posts" | "events" | "config";

/** One editable content item = one Markdown file under content/. */
export interface EditableItem {
  collection: Collection;
  path: string; // repo-relative, e.g. content/posts/2026/2026-05-02-….md
  frontmatter: Record<string, unknown>;
  body: string;
  sha?: string; // blob sha / blob_id at load → optimistic concurrency
}

/** A draft is a branch; metadata is derived from git (no database). */
export interface Draft {
  branch: string; // draft/<editor-slug>/<item-slug>
  base: string; // usually "red"
  item: EditableItem;
  previewUrl?: string;
  updatedBy: string;
  updatedAt: string;
}

/** Host-agnostic git operations. Implemented per host (GitHub now, GitLab next). */
export interface GitHostAdapter {
  readFile(path: string, ref?: string): Promise<EditableItem | null>;
  listFiles(dir: string, ref?: string): Promise<string[]>;
  ensureBranch(branch: string, fromRef: string): Promise<void>;
  listBranches(prefix?: string): Promise<string[]>;
  commitFile(args: {
    branch: string;
    path: string;
    contents: string;
    message: string;
    author: Editor;
    baseSha?: string;
  }): Promise<{ commitSha: string }>;
  openChangeRequest(args: {
    branch: string;
    base: string;
    title: string;
    body?: string;
  }): Promise<{ id: string; url: string }>;
  merge(args: {
    branch: string;
    base: string;
    method?: "merge" | "squash";
  }): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
}

/** Publish is pluggable: direct-merge vs open-a-change-request (governance). */
export interface PublishTarget {
  publish(
    draft: Draft,
    editor: Editor,
  ): Promise<{ mode: "merged" | "requested"; url: string }>;
}
