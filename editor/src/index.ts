/**
 * svdsa-edit Worker — the in-browser editor (Phase 2).
 *
 * Separate from production `svdsa`, behind Cloudflare Access. Edit content →
 * save commits to a draft branch (authored as the editor) → the branch's
 * Workers Build is the preview. Publish (merge/MR) comes next.
 *
 * This Worker owns the `/api/*` routes only; the editor UI is a Vite-built SPA
 * (editor/web → editor/dist) served by the Static Assets binding.
 * See plans/svdsa-wysiwyg-phase0.md and plans/svdsa-editor-rich-ui.md.
 */

import { createGitHub, type Author } from "./git/github";
import {
  branchName,
  parseMarkdown,
  serializeMarkdown,
} from "./content/serialize";

export interface Env {
  GIT_HOST?: "github" | "gitlab";
  EDITOR_DEFAULT_BASE?: string;
  GH_REPO?: string;
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string; // secret (PKCS#8)
  GITLAB_TOKEN?: string; // secret
  GITLAB_PROJECT_ID?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

/** Access injects the authenticated email; see plan for JWT-verification hardening. */
function editor(request: Request): Author {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ?? "editor@svdsa";
  return { name: email, email };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Best-effort Workers Builds preview URL for a branch of the production Worker. */
function previewUrl(request: Request, branch: string): string {
  const host = new URL(request.url).host; // svdsa-edit.<sub>.workers.dev
  const sub = host.split(".")[1] ?? "workers";
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://${alias}-svdsa.${sub}.workers.dev/`;
}

async function health(env: Env) {
  if ((env.GIT_HOST ?? "github") !== "github")
    return { ok: false, error: `GIT_HOST=${env.GIT_HOST} not implemented yet` };
  try {
    const gh = await createGitHub(env);
    const repo = await gh.repoInfo();
    const branches = await gh.listBranches();
    const base = env.EDITOR_DEFAULT_BASE ?? "red";
    return {
      ok: true,
      repo: repo.full_name,
      defaultBranch: repo.default_branch,
      base,
      baseExists: branches.includes(base),
      branches,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function handleApi(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  const url = new URL(request.url);

  // Identity comes straight from the Access-injected header — no git needed.
  if (path === "/api/me") return json(editor(request));

  const gh = await createGitHub(env);

  if (path === "/api/branches")
    return json({ branches: await gh.listBranches() });

  if (path === "/api/list") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    return json({ base, items: await gh.listContent(base) });
  }

  if (path === "/api/item") {
    const p = url.searchParams.get("path");
    const ref = url.searchParams.get("ref") || env.EDITOR_DEFAULT_BASE || "red";
    if (!p) return json({ error: "path required" }, 400);
    const raw = await gh.readItem(p, ref);
    const { frontmatter, body } = parseMarkdown(raw.text);
    return json({ path: p, ref, frontmatter, body, sha: raw.sha });
  }

  if (path === "/api/save" && request.method === "POST") {
    const {
      base,
      path: p,
      frontmatter,
      body,
    } = (await request.json()) as {
      base: string;
      path: string;
      frontmatter: Record<string, unknown>;
      body: string;
    };
    if (!p || !base) return json({ error: "base and path required" }, 400);
    const who = editor(request);
    const branch = branchName(who.email, base, p);
    await gh.ensureBranch(branch, base);
    const text = serializeMarkdown(frontmatter, body);
    const { commitSha } = await gh.commit({
      branch,
      path: p,
      text,
      message: `edit ${p} (via editor)`,
      author: who,
    });
    return json({ branch, commitSha, previewUrl: previewUrl(request, branch) });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return json(await health(env));
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }
    // Non-API paths are served by the Static Assets binding (run_worker_first
    // only routes /api/* here); reaching this is unexpected.
    return new Response("Not found", { status: 404 });
  },
};
