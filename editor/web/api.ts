/** Typed fetch client for the svdsa-edit Worker's /api/* routes. */

export interface Me {
  email: string;
  /** Origin of the production site Worker, derived server-side. */
  siteOrigin: string;
}
export interface ItemDetail {
  path: string;
  ref: string;
  base: string;
  fromDraft: boolean;
  frontmatter: Record<string, unknown>;
  body: string;
  sha: string;
}
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
  previewUrl: string;
  lint: LintFinding[];
  autofixed: number;
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
  const d = (await r.json()) as T & { error?: string };
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
    req<{ base: string; items: string[] }>(
      `/api/list?base=${encodeURIComponent(base)}`,
    ),
  item: (path: string, base: string) =>
    req<ItemDetail>(
      `/api/item?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}`,
    ),
  status: (base: string) =>
    req<DraftStatus>(`/api/status?base=${encodeURIComponent(base)}`),
  titles: (dir: string, base: string) =>
    req<{ titles: Record<string, string> }>(
      `/api/titles?dir=${encodeURIComponent(dir)}&base=${encodeURIComponent(base)}`,
    ),
  save: (payload: {
    base: string;
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }) => post<SaveResult>("/api/save", payload),
  createBranch: (name: string, from: string) =>
    post<{ branch: string }>("/api/branch", { name, from }),
  publish: (base: string, title?: string) =>
    post<{ pr: Pr; alreadyOpen: boolean }>("/api/publish", { base, title }),
  discard: (base: string) =>
    post<{ discarded: string }>("/api/discard", { base }),
};
