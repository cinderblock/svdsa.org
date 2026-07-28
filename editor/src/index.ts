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
  validBranchName,
} from "./content/serialize";
import { fixText, lintText, type StyleRule } from "./content/lint";

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
  SITE_WORKER?: string;
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

/**
 * Both the site and this editor are Workers on the same account, so their
 * hostnames differ only in the first label: `<worker>.<subdomain>.workers.dev`.
 * Swap in the site Worker's name to reach it — and prefix the branch alias for
 * a Workers Builds preview. Keeps account/name moves to `SITE_WORKER`.
 */
function siteHostParts(request: Request, env: Env) {
  const [, ...rest] = new URL(request.url).host.split(".");
  return { worker: env.SITE_WORKER ?? "site", rest: rest.join(".") };
}

function siteOrigin(request: Request, env: Env): string {
  const { worker, rest } = siteHostParts(request, env);
  return `https://${worker}${rest ? `.${rest}` : ""}`;
}

/** Best-effort Workers Builds preview URL for a branch of the production Worker. */
function previewUrl(request: Request, env: Env, branch: string): string {
  const { worker, rest } = siteHostParts(request, env);
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://${alias}-${worker}${rest ? `.${rest}` : ""}/`;
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
  if (path === "/api/me")
    return json({ ...editor(request), siteOrigin: siteOrigin(request, env) });

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
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    if (!p) return json({ error: "path required" }, 400);
    // Serve the editor's drafted version when one exists, else the base copy.
    const draft = branchName(editor(request).email, base);
    let ref = base;
    let fromDraft = false;
    if (await gh.branchExists(draft)) {
      const changed = await gh.changedFiles(base, draft);
      if (changed.some((f) => f.path === p)) {
        ref = draft;
        fromDraft = true;
      }
    }
    const raw = await gh.readItem(p, ref);
    const { frontmatter, body } = parseMarkdown(raw.text);
    return json({
      path: p,
      ref,
      base,
      fromDraft,
      frontmatter,
      body,
      sha: raw.sha,
    });
  }

  // Frontmatter titles for one directory (pretty labels in the file browser).
  if (path === "/api/titles") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    const dir = url.searchParams.get("dir") ?? "";
    if (!/^content\/(pages|posts|events|config)(\/\d{4})?$/.test(dir))
      return json({ error: "invalid dir" }, 400);
    return json({ base, dir, titles: await gh.titlesForDir(base, dir) });
  }

  // Draft workspace state for this editor+base: branch, changed files, open PR.
  if (path === "/api/status") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    const draft = branchName(editor(request).email, base);
    if (!(await gh.branchExists(draft)))
      return json({ base, draft, exists: false, changed: [], pr: null });
    const [changed, pr] = await Promise.all([
      gh.changedFiles(base, draft),
      gh.findPull(draft, base),
    ]);
    return json({
      base,
      draft,
      exists: true,
      changed,
      pr,
      previewUrl: previewUrl(request, env, draft),
    });
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
    const branch = branchName(who.email, base);
    await gh.ensureBranch(branch, base);
    // Normalize (serializeMarkdown), then AUTO-FIX every style rule with a
    // deterministic suggestion before committing; only unfixable findings are
    // returned as warnings. Rules are chapter-owned content — if the rules
    // file is missing or broken, saves still succeed, just unlinted.
    let text = serializeMarkdown(frontmatter, body);
    let lint: ReturnType<typeof lintText> = [];
    let autofixed = 0;
    try {
      const rulesRaw = await gh.readItem(
        "content/config/style-rules.json",
        base,
      );
      const rules = JSON.parse(rulesRaw.text) as StyleRule[];
      const before = lintText(text, rules).length;
      text = fixText(text, rules);
      lint = lintText(text, rules);
      autofixed = before - lint.length;
    } catch {
      /* no rules — no findings */
    }
    const { commitSha } = await gh.commit({
      branch,
      path: p,
      text,
      message: `edit ${p} (via editor)`,
      author: who,
    });
    return json({
      branch,
      commitSha,
      previewUrl: previewUrl(request, env, branch),
      lint,
      autofixed,
    });
  }

  // Create a real (non-draft) branch, e.g. a new theme/ experiment.
  if (path === "/api/branch" && request.method === "POST") {
    const { name, from } = (await request.json()) as {
      name: string;
      from: string;
    };
    if (!name || !from) return json({ error: "name and from required" }, 400);
    if (!validBranchName(name) || name.startsWith("draft/"))
      return json({ error: "invalid branch name" }, 400);
    await gh.ensureBranch(name, from);
    return json({ branch: name });
  }

  // Publish = open a PR from the draft workspace into its base. Review/merge
  // happens on GitHub (protects red from unreviewed direct pushes).
  if (path === "/api/publish" && request.method === "POST") {
    const { base, title } = (await request.json()) as {
      base: string;
      title?: string;
    };
    if (!base) return json({ error: "base required" }, 400);
    const who = editor(request);
    const draft = branchName(who.email, base);
    if (!(await gh.branchExists(draft)))
      return json({ error: "no draft to publish" }, 400);
    const changed = await gh.changedFiles(base, draft);
    if (!changed.length)
      return json({ error: "draft has no changes vs base" }, 400);
    const existing = await gh.findPull(draft, base);
    if (existing) return json({ pr: existing, alreadyOpen: true });
    const pr = await gh.createPull({
      head: draft,
      base,
      title:
        title ||
        `Content edits: ${changed
          .map((f) => f.path.split("/").pop())
          .join(", ")
          .slice(0, 60)}`,
      body:
        `Opened by **${who.email}** via the SVDSA editor.\n\n` +
        changed.map((f) => `- ${f.status}: \`${f.path}\``).join("\n") +
        `\n\nPreview: ${previewUrl(request, env, draft)}`,
    });
    return json({ pr, alreadyOpen: false });
  }

  // Throw the draft away (delete the workspace branch). UI confirms first.
  if (path === "/api/discard" && request.method === "POST") {
    const { base } = (await request.json()) as { base: string };
    if (!base) return json({ error: "base required" }, 400);
    const draft = branchName(editor(request).email, base);
    if (await gh.branchExists(draft)) await gh.deleteBranch(draft);
    return json({ discarded: draft });
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
