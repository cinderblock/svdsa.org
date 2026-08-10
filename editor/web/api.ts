/** Typed fetch client for the svdsa-edit Worker's /api/* routes. */

/** Frontmatter facts the file browser shows. */
export interface ItemMeta {
  title?: string;
  url?: string;
  date?: string;
  recurs?: boolean;
}

/** The site's own navigation (content/config/navigation.json). */
export interface SiteNav {
  workingGroups?: { label: string; to: string; icon?: string }[];
  committees?: { label: string; to: string; icon?: string }[];
  resources?: { label: string; to: string; icon?: string }[];
}

/** One entry in the chapter's event-category vocabulary. */
export interface EventCategory {
  label: string;
  hue?: number;
  note?: string;
  retired?: boolean;
}

export type NewKind = "page" | "post" | "event" | "series";

/** What the wizard sends. Note it never sends a path — the Worker builds it. */
export interface NewItemInput {
  kind: NewKind;
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  parent?: string;
  categories?: string[];
  venue?: string;
  isVirtual?: boolean;
  draft?: boolean;
  summary?: string;
}

export interface CreateResult {
  path: string;
  url: string;
  draft: boolean;
  branch: string;
  commitSha: string;
  sha: string;
  previewUrl: string;
}

export interface RenameResult {
  path: string;
  url: string;
  from: string;
  fromUrl: string;
  /** False when the old address was never public, so no redirect was needed. */
  redirected: boolean;
  branch: string;
  commitSha: string;
  previewUrl: string;
}

export interface Me {
  email: string;
  /** Origin of the production site Worker, derived server-side. */
  siteOrigin: string;
  /** Why the editor is NOT behind Cloudflare Access, or null when it is. */
  unprotected: string | null;
}
interface ItemCommon {
  path: string;
  ref: string;
  base: string;
  fromDraft: boolean;
  sha: string;
}

/**
 * Two genuinely different kinds of file, kept apart by the type system so the
 * UI can't accidentally put YAML in the rich-text editor (which would rewrite
 * it as Markdown — see isConfigPath in the Worker).
 */
export type ItemDetail = ItemCommon &
  (
    | { kind: "markdown"; frontmatter: Record<string, unknown>; body: string }
    | { kind: "yaml"; text: string }
  );
export interface LintFinding {
  ruleId: string;
  level: "error" | "warn";
  line: number;
  column: number;
  match: string;
  message: string;
  suggest?: string;
}
export interface SaveResult {
  branch: string;
  commitSha: string;
  /** Blob sha of what was just written — becomes the next save's `sha`. */
  sha: string;
  previewUrl: string;
  lint: LintFinding[];
  autofixed: number;
}

/** A save refused because the file moved on since it was opened. */
export class SaveConflict extends Error {
  constructor(
    message: string,
    readonly currentSha?: string,
  ) {
    super(message);
  }
}
export interface ChangedFile {
  path: string;
  status: string;
}
export interface Pr {
  number: number;
  url: string;
  title?: string;
}
export interface DraftStatus {
  base: string;
  draft: string;
  exists: boolean;
  changed: ChangedFile[];
  pr: Pr | null;
  previewUrl?: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = (await r.json()) as T & {
    error?: string;
    conflict?: boolean;
    currentSha?: string;
  };
  if (r.status === 409 && d.conflict)
    throw new SaveConflict(d.error ?? "conflict", d.currentSha);
  if (!r.ok || d.error) throw new Error(d.error || `${r.status} ${url}`);
  return d;
}

const post = <T>(url: string, payload: unknown) =>
  req<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

export const api = {
  me: () => req<Me>("/api/me"),
  branches: () => req<{ branches: string[] }>("/api/branches"),
  list: (base: string) =>
    req<{
      base: string;
      items: string[];
      nav: SiteNav | null;
      categories: EventCategory[] | null;
    }>(`/api/list?base=${encodeURIComponent(base)}`),
  item: (path: string, base: string) =>
    req<ItemDetail>(
      `/api/item?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}`,
    ),
  status: (base: string) =>
    req<DraftStatus>(`/api/status?base=${encodeURIComponent(base)}`),
  meta: (dir: string, base: string) =>
    req<{ meta: Record<string, ItemMeta> }>(
      `/api/meta?dir=${encodeURIComponent(dir)}&base=${encodeURIComponent(base)}`,
    ),
  save: (
    payload: { base: string; path: string; sha?: string } & (
      | { frontmatter: Record<string, unknown>; body: string }
      | { text: string }
    ),
  ) => post<SaveResult>("/api/save", payload),
  create: (payload: { base: string } & NewItemInput) =>
    post<CreateResult>("/api/create", payload),
  rename: (payload: {
    base: string;
    from: string;
    slug: string;
    parent?: string;
  }) => post<RenameResult>("/api/rename", payload),
  createBranch: (name: string, from: string) =>
    post<{ branch: string }>("/api/branch", { name, from }),
  publish: (base: string, title?: string) =>
    post<{ pr: Pr; alreadyOpen: boolean }>("/api/publish", { base, title }),
  discard: (base: string) =>
    post<{ discarded: string }>("/api/discard", { base }),
};
