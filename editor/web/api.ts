/** Typed fetch client for the svdsa-edit Worker's /api/* routes. */

export interface Me {
  email: string;
}
export interface ItemDetail {
  path: string;
  ref: string;
  frontmatter: Record<string, unknown>;
  body: string;
  sha: string;
}
export interface SaveResult {
  branch: string;
  commitSha: string;
  previewUrl: string;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok || d.error) throw new Error(d.error || `${r.status} ${url}`);
  return d;
}

export const api = {
  me: () => get<Me>("/api/me"),
  branches: () => get<{ branches: string[] }>("/api/branches"),
  list: (base: string) =>
    get<{ base: string; items: string[] }>(
      `/api/list?base=${encodeURIComponent(base)}`,
    ),
  item: (path: string, ref: string) =>
    get<ItemDetail>(
      `/api/item?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`,
    ),
  save: async (payload: {
    base: string;
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }): Promise<SaveResult> => {
    const r = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = (await r.json()) as SaveResult & { error?: string };
    if (!r.ok || d.error)
      throw new Error(d.error || `save failed (${r.status})`);
    return d;
  },
};
