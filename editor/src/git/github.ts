/**
 * GitHub App authentication + REST for the editor Worker.
 *
 * Mints an installation access token (App JWT → installation token) using Web
 * Crypto — no dependencies. The App private key must be **PKCS#8**
 * ("BEGIN PRIVATE KEY"); the setup tool converts the GitHub-downloaded PKCS#1
 * key on the way into the secret.
 */

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

export interface RawItem {
  path: string;
  sha: string; // blob sha at the read ref (for optimistic concurrency)
  text: string; // raw .md (frontmatter + body)
}

const CONTENT_RE = /^content\/(pages|posts|events|config)\/.+\.md$/;

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
    /** Editable content files (content/{pages,posts,events,config}/*.md) at ref. */
    async listContent(ref: string): Promise<string[]> {
      const sha = await branchSha(ref);
      const t = (await api(`${base}/git/trees/${sha}?recursive=1`)) as {
        tree: { path: string; type: string }[];
      };
      return t.tree
        .filter((n) => n.type === "blob" && CONTENT_RE.test(n.path))
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
    /** Commit `text` to `path` on `branch`, authored by the editor. */
    async commit(args: {
      branch: string;
      path: string;
      text: string;
      message: string;
      author: Author;
    }): Promise<{ commitSha: string }> {
      const sha = await fileSha(args.path, args.branch);
      const r = (await api(`${base}/contents/${encPath(args.path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: args.message,
          content: b64encodeUtf8(args.text),
          branch: args.branch,
          sha,
          author: args.author,
        }),
      })) as { commit: { sha: string } };
      return { commitSha: r.commit.sha };
    },
  };
}
