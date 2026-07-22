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

const API = "https://api.github.com";
const UA = "svdsa-edit";

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

/** Signed GitHub App JWT (valid ~9 min). */
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

/** Exchange the App JWT for a short-lived installation token. */
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

/** A GitHub client bound to one installation token (mint once per request). */
export async function createGitHub(env: GhEnv) {
  const [owner, repo] = (env.GH_REPO ?? "").split("/");
  if (!owner || !repo) throw new Error("GH_REPO must be 'owner/repo'.");
  const token = await installationToken(env);

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

  return {
    owner,
    repo,
    /** Basic reachability check — returns the repo's full name + default branch. */
    async repoInfo(): Promise<{ full_name: string; default_branch: string }> {
      return api(`/repos/${owner}/${repo}`) as Promise<{
        full_name: string;
        default_branch: string;
      }>;
    },
    async listBranches(): Promise<string[]> {
      const branches = (await api(
        `/repos/${owner}/${repo}/branches?per_page=100`,
      )) as { name: string }[];
      return branches.map((b) => b.name);
    },
  };
}
