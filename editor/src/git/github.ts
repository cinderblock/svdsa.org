/**
 * GitHub App authentication + REST for the editor Worker.
 *
 * Mints an installation access token (App JWT → installation token) using Web
 * Crypto — no dependencies. The App private key must be **PKCS#8**
 * ("BEGIN PRIVATE KEY"); the setup tool converts the GitHub-downloaded PKCS#1
 * key on the way into the secret.
 */

import { isEditablePath } from "../content/serialize";

/**
 * The file changed under the editor between load and save. Carries the sha that
 * is actually there now, so the UI can offer to show the difference.
 */
export class ConflictError extends Error {
  constructor(readonly currentSha: string | undefined) {
    super("file changed since it was opened");
  }
}

interface GhEnv {
  GH_REPO?: string; // "owner/repo"
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string;
}

export interface Author {
  name: string;
  email: string;
}

/** A pull request as the branch browser shows it. */
export interface BranchPull {
  number: number;
  url: string;
  title: string;
  state: string;
  isDraft: boolean;
  baseRefName: string;
}

/** Everything the branch browser needs to describe one branch. */
export interface BranchDetail {
  name: string;
  /** Null only for the exotic case of a branch pointing at a non-commit. */
  commit: {
    oid: string;
    subject: string;
    committedDate: string;
    author: string;
  } | null;
  /** Commits this branch has that the comparison branch doesn't, and vice versa. */
  ahead: number;
  behind: number;
  pull: BranchPull | null;
}

const API = "https://api.github.com";
const UA = "svdsa-edit";

// ---- crypto / encoding ------------------------------------------------------

function b64urlFromString(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return b64urlFromString(bin);
}
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----(BEGIN|END)[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
/** base64-encode a UTF-8 string (for the GitHub Contents API). */
function b64encodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
/** decode base64 (possibly newline-wrapped) UTF-8 content from GitHub. */
function b64decodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
/** encode a repo path, preserving slashes. */
const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// ---- auth -------------------------------------------------------------------

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new Error(
      "GH_PRIVATE_KEY is PKCS#1 — store it as PKCS#8 (re-run `bun run setup:editor`, which converts it).",
    );
  }
  return crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function appJwt(env: GhEnv): Promise<string> {
  if (!env.GH_APP_ID || !env.GH_PRIVATE_KEY)
    throw new Error("GH_APP_ID / GH_PRIVATE_KEY not configured.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64urlFromString(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GH_APP_ID }),
  );
  const input = `${header}.${payload}`;
  const key = await importPrivateKey(env.GH_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

async function installationToken(env: GhEnv): Promise<string> {
  if (!env.GH_INSTALLATION_ID)
    throw new Error("GH_INSTALLATION_ID not configured.");
  const jwt = await appJwt(env);
  const res = await fetch(
    `${API}/app/installations/${env.GH_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": UA,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok)
    throw new Error(`installation token: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

// ---- client -----------------------------------------------------------------

/** What the file browser shows for one content item. */
export interface ItemMeta {
  title?: string;
  /** The page's URL on the live site, from frontmatter `path`. */
  url?: string;
  /** Event start, post date, or last-modified — whichever the item has. */
  date?: string;
  /** True for a recurring event series. */
  recurs?: boolean;
}

export interface RawItem {
  path: string;
  sha: string; // blob sha at the read ref (for optimistic concurrency)
  text: string; // raw .md (frontmatter + body)
}

/** A GitHub client bound to one installation token (mint once per request). */
export async function createGitHub(env: GhEnv) {
  const [owner, repo] = (env.GH_REPO ?? "").split("/");
  if (!owner || !repo) throw new Error("GH_REPO must be 'owner/repo'.");
  const token = await installationToken(env);
  const base = `/repos/${owner}/${repo}`;

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": UA,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok)
      throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok)
      throw new Error(`GitHub GraphQL: ${res.status} ${await res.text()}`);
    const d = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (d.errors?.length)
      throw new Error(`GitHub GraphQL: ${d.errors[0].message}`);
    return d.data as T;
  }

  async function branchSha(ref: string): Promise<string> {
    const r = (await api(`${base}/git/ref/heads/${encPath(ref)}`)) as {
      object: { sha: string };
    };
    return r.object.sha;
  }
  async function branchExists(branch: string): Promise<boolean> {
    try {
      await api(`${base}/git/ref/heads/${encPath(branch)}`);
      return true;
    } catch {
      return false;
    }
  }
  async function fileSha(
    path: string,
    ref: string,
  ): Promise<string | undefined> {
    try {
      const r = (await api(
        `${base}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`,
      )) as { sha: string };
      return r.sha;
    } catch {
      return undefined; // new file
    }
  }

  return {
    owner,
    repo,
    async repoInfo(): Promise<{ full_name: string; default_branch: string }> {
      return api(base) as Promise<{
        full_name: string;
        default_branch: string;
      }>;
    },
    async listBranches(): Promise<string[]> {
      const branches = (await api(`${base}/branches?per_page=100`)) as {
        name: string;
      }[];
      return branches.map((b) => b.name);
    },
    /**
     * Every branch with the facts a human needs to choose between them — last
     * commit, divergence from `compareTo`, open PR — in ONE GraphQL round-trip.
     * (The REST equivalent is a compare and a PR search per branch.)
     *
     * The divergence numbers arrive INVERTED. `Ref.compare` treats the ref it
     * hangs off as the *base*, so asking each branch to compare against
     * production yields `aheadBy` = how far production has moved past this
     * branch, i.e. this branch's "behind". Comparing the other way round would
     * mean knowing the branch names before building the query — a second
     * round-trip — so we accept the twist and swap it here.
     */
    async branchDetails(compareTo: string): Promise<BranchDetail[]> {
      interface GqlCommit {
        oid: string;
        messageHeadline: string;
        committedDate: string;
        author?: { name?: string; user?: { login?: string } | null } | null;
        associatedPullRequests?: {
          nodes: (BranchPull & { headRefName: string })[];
        };
      }
      const data = await graphql<{
        repository: {
          refs: {
            nodes: {
              name: string;
              target: GqlCommit | null;
              compare: { aheadBy: number; behindBy: number } | null;
            }[];
          };
        };
      }>(
        `
          query ($owner: String!, $repo: String!, $head: String!) {
            repository(owner: $owner, name: $repo) {
              refs(
                refPrefix: "refs/heads/"
                first: 100
                orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
              ) {
                nodes {
                  name
                  target {
                    ... on Commit {
                      oid
                      messageHeadline
                      committedDate
                      author {
                        name
                        user {
                          login
                        }
                      }
                      associatedPullRequests(
                        first: 5
                        orderBy: { field: UPDATED_AT, direction: DESC }
                      ) {
                        nodes {
                          number
                          url
                          title
                          state
                          isDraft
                          baseRefName
                          headRefName
                        }
                      }
                    }
                  }
                  compare(headRef: $head) {
                    aheadBy
                    behindBy
                  }
                }
              }
            }
          }
        `,
        { owner, repo, head: compareTo },
      );

      return data.repository.refs.nodes.map((ref) => {
        const c = ref.target;
        const pulls = c?.associatedPullRequests?.nodes ?? [];
        // A commit can carry several PRs (it may have been merged onward).
        // Prefer one still open FROM this branch; otherwise the most recent.
        const pull =
          pulls.find((p) => p.state === "OPEN" && p.headRefName === ref.name) ??
          pulls.find((p) => p.headRefName === ref.name) ??
          null;
        return {
          name: ref.name,
          commit: c
            ? {
                oid: c.oid,
                subject: c.messageHeadline,
                committedDate: c.committedDate,
                author: c.author?.user?.login || c.author?.name || "",
              }
            : null,
          ahead: ref.compare?.behindBy ?? 0,
          behind: ref.compare?.aheadBy ?? 0,
          pull: pull && {
            number: pull.number,
            url: pull.url,
            title: pull.title,
            state: pull.state,
            isDraft: pull.isDraft,
            baseRefName: pull.baseRefName,
          },
        };
      });
    },
    /** Editable content files (content/{pages,posts,events,config}/*.md) at ref. */
    async listContent(ref: string): Promise<string[]> {
      const sha = await branchSha(ref);
      const t = (await api(`${base}/git/trees/${sha}?recursive=1`)) as {
        tree: { path: string; type: string }[];
      };
      return t.tree
        .filter((n) => n.type === "blob" && isEditablePath(n.path))
        .map((n) => n.path)
        .sort();
    },
    async readItem(path: string, ref: string): Promise<RawItem> {
      const r = (await api(
        `${base}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`,
      )) as { content: string; sha: string };
      return { path, sha: r.sha, text: b64decodeUtf8(r.content) };
    },
    branchExists,
    /** Create `branch` off `fromRef` if it doesn't exist. */
    async ensureBranch(branch: string, fromRef: string): Promise<void> {
      if (await branchExists(branch)) return;
      const sha = await branchSha(fromRef);
      await api(`${base}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
    },
    /**
     * Frontmatter metadata for every .md directly inside `dir` at `ref` — ONE
     * GraphQL round-trip for the whole directory (vs N Contents calls). Returns
     * what the file browser needs to show and sort a useful list: the title, a
     * date, and the page's URL on the site.
     */
    async metaForDir(
      ref: string,
      dir: string,
    ): Promise<Record<string, ItemMeta>> {
      const data = await graphql<{
        repository: {
          object: {
            entries?: {
              name: string;
              type: string;
              object?: { text?: string };
            }[];
          } | null;
        };
      }>(
        `
          query ($owner: String!, $repo: String!, $expr: String!) {
            repository(owner: $owner, name: $repo) {
              object(expression: $expr) {
                ... on Tree {
                  entries {
                    name
                    type
                    object {
                      ... on Blob {
                        text
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        { owner, repo, expr: `${ref}:${dir}` },
      );
      const out: Record<string, ItemMeta> = {};
      for (const e of data.repository.object?.entries ?? []) {
        if (
          e.type !== "blob" ||
          !(e.name.endsWith(".md") || e.name.endsWith(".yaml"))
        )
          continue;
        const text = e.object?.text ?? "";
        const fmEnd = text.indexOf("\n---", 3);
        const fm = fmEnd === -1 ? text.slice(0, 4000) : text.slice(0, fmEnd);
        const field = (name: string) => {
          const m = fm.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
          if (!m) return undefined;
          let v = m[1].trim();
          if (
            (v.startsWith("'") && v.endsWith("'")) ||
            (v.startsWith('"') && v.endsWith('"'))
          )
            v = v.slice(1, -1).replace(/''/g, "'");
          return v || undefined;
        };
        out[`${dir}/${e.name}`] = {
          title: field("title"),
          url: field("path"),
          date: field("start") ?? field("date") ?? field("modified"),
          recurs: /^recurrence:/m.test(fm),
        };
      }
      return out;
    },
    async deleteBranch(branch: string): Promise<void> {
      await api(`${base}/git/refs/heads/${encPath(branch)}`, {
        method: "DELETE",
      });
    },
    /** Files changed on `head` since it diverged from `baseRef`. */
    async changedFiles(
      baseRef: string,
      head: string,
    ): Promise<{ path: string; status: string }[]> {
      const r = (await api(
        `${base}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(head)}`,
      )) as { files?: { filename: string; status: string }[] };
      return (r.files ?? []).map((f) => ({
        path: f.filename,
        status: f.status,
      }));
    },
    /** The open PR from `head` into `baseRef`, if any. */
    async findPull(
      head: string,
      baseRef: string,
    ): Promise<{ number: number; url: string; title: string } | null> {
      const prs = (await api(
        `${base}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}&base=${encodeURIComponent(baseRef)}`,
      )) as { number: number; html_url: string; title: string }[];
      const pr = prs[0];
      return pr
        ? { number: pr.number, url: pr.html_url, title: pr.title }
        : null;
    },
    /** Open a PR from `head` into `baseRef`. Requires the GitHub App to have
     * "Pull requests: Read & write" permission. */
    async createPull(args: {
      head: string;
      base: string;
      title: string;
      body: string;
    }): Promise<{ number: number; url: string }> {
      try {
        const pr = (await api(`${base}/pulls`, {
          method: "POST",
          body: JSON.stringify(args),
        })) as { number: number; html_url: string };
        return { number: pr.number, url: pr.html_url };
      } catch (e) {
        const msg = (e as Error).message;
        if (/403|Resource not accessible/i.test(msg)) {
          throw new Error(
            "The GitHub App can't open pull requests — grant it 'Pull requests: Read & write' " +
              "in the App's permissions and accept the update on the installation, then retry. " +
              `(${msg})`,
          );
        }
        throw e;
      }
    },
    /** Blob sha of `path` at `ref`, or undefined if it isn't there. */
    fileSha,
    /**
     * Commit `text` to `path` on `branch`, authored by the editor.
     *
     * `expectedSha` is the blob sha the editor loaded. Passing it makes this an
     * optimistic-concurrency write: if the file has moved on since (the same
     * person editing in two tabs, or a stale tab left open across a publish),
     * the write is REFUSED rather than silently overwriting the newer copy.
     * Pass `null` to assert the file does not exist yet (a create).
     */
    async commit(args: {
      branch: string;
      path: string;
      text: string;
      message: string;
      author: Author;
      expectedSha?: string | null;
    }): Promise<{ commitSha: string; sha: string }> {
      const sha = await fileSha(args.path, args.branch);
      if (
        args.expectedSha !== undefined &&
        sha !== (args.expectedSha ?? undefined)
      )
        throw new ConflictError(sha);
      const r = (await api(`${base}/contents/${encPath(args.path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: args.message,
          content: b64encodeUtf8(args.text),
          branch: args.branch,
          sha,
          author: args.author,
        }),
      })) as { commit: { sha: string }; content: { sha: string } };
      return { commitSha: r.commit.sha, sha: r.content.sha };
    },
    /**
     * Commit several file changes as ONE commit (`text: null` deletes).
     *
     * Rename needs this. Writing the new file, deleting the old one, and
     * recording the redirect are three edits that must land together — done as
     * separate Contents-API calls, an interruption between them leaves the page
     * at two addresses, or at none, or live with no redirect behind it.
     */
    async commitTree(args: {
      branch: string;
      message: string;
      author: Author;
      changes: { path: string; text: string | null }[];
    }): Promise<{ commitSha: string }> {
      const parent = await branchSha(args.branch);
      const head = (await api(`${base}/git/commits/${parent}`)) as {
        tree: { sha: string };
      };
      const tree = (await api(`${base}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: head.tree.sha,
          tree: args.changes.map((c) => ({
            path: c.path,
            mode: "100644",
            type: "blob",
            // A null sha against an existing path is how the Git Data API
            // expresses "remove this entry".
            ...(c.text === null ? { sha: null } : { content: c.text }),
          })),
        }),
      })) as { sha: string };
      const created = (await api(`${base}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: args.message,
          tree: tree.sha,
          parents: [parent],
          author: args.author,
        }),
      })) as { sha: string };
      await api(`${base}/git/refs/heads/${encPath(args.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: created.sha }),
      });
      return { commitSha: created.sha };
    },
  };
}
