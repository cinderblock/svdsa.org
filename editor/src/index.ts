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

import { ConflictError, createGitHub, type Author } from "./git/github";
import {
  AccessDenied,
  authenticate,
  unprotectedReason,
  type AccessEnv,
} from "./access";
import {
  branchName,
  isConfigPath,
  isEditablePath,
  parseMarkdown,
  serializeMarkdown,
  validBranchName,
} from "./content/serialize";
import { fixText, lintText, type StyleRule } from "./content/lint";
import yaml from "js-yaml";

export interface Env extends AccessEnv {
  GIT_HOST?: "github" | "gitlab";
  EDITOR_DEFAULT_BASE?: string;
  GH_REPO?: string;
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string; // secret (PKCS#8)
  GITLAB_TOKEN?: string; // secret
  GITLAB_PROJECT_ID?: string;
  SITE_WORKER?: string;
}

function parsesAsYaml(text: string): boolean {
  try {
    yaml.load(text);
    return true;
  } catch {
    return false;
  }
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
  who: Author,
): Promise<Response> {
  const url = new URL(request.url);

  // Identity is already verified; `unprotected` drives the UI's warning banner.
  if (path === "/api/me")
    return json({
      ...who,
      siteOrigin: siteOrigin(request, env),
      unprotected: unprotectedReason(env),
    });

  const gh = await createGitHub(env);

  if (path === "/api/branches")
    return json({ branches: await gh.listBranches() });

  if (path === "/api/list") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    // Ship the site's own nav with the file list: the browser groups pages the
    // way the real site does, so "where is the Housing page" has the same
    // answer in both places. Navigation is content, so read it from this ref.
    let nav: unknown = null;
    try {
      const raw = await gh.readItem("content/config/navigation.yaml", base);
      nav = yaml.load(raw.text);
    } catch {
      /* nav is optional — the browser falls back to plain sections */
    }
    return json({ base, items: await gh.listContent(base), nav });
  }

  if (path === "/api/item") {
    const p = url.searchParams.get("path");
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    if (!p) return json({ error: "path required" }, 400);
    if (!isEditablePath(p)) return json({ error: "not an editable path" }, 400);
    // Serve the editor's drafted version when one exists, else the base copy.
    const draft = branchName(who.email, base);
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
    const common = { path: p, ref, base, fromDraft, sha: raw.sha };
    // Config is data: hand back the file verbatim. Splitting it into
    // frontmatter+body would feed YAML to the Markdown editor (see isConfigPath).
    if (isConfigPath(p))
      return json({ ...common, kind: "yaml", text: raw.text });
    const { frontmatter, body } = parseMarkdown(raw.text);
    return json({ ...common, kind: "markdown", frontmatter, body });
  }

  // Frontmatter metadata for one directory (labels, URLs, dates, recurrence).
  if (path === "/api/meta") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    const dir = url.searchParams.get("dir") ?? "";
    if (!/^content\/(pages|posts|events|config)(\/\d{4})?$/.test(dir))
      return json({ error: "invalid dir" }, 400);
    return json({ base, dir, meta: await gh.metaForDir(base, dir) });
  }

  // Draft workspace state for this editor+base: branch, changed files, open PR.
  if (path === "/api/status") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    const draft = branchName(who.email, base);
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
      text: configText,
      sha: expectedSha,
    } = (await request.json()) as {
      base: string;
      path: string;
      frontmatter?: Record<string, unknown>;
      body?: string;
      text?: string;
      sha?: string;
    };
    if (!p || !base) return json({ error: "base and path required" }, 400);
    // The write boundary. This Worker commits as a trusted GitHub App, so an
    // unchecked path here would let a caller write anywhere in the repo.
    if (!isEditablePath(p)) return json({ error: "not an editable path" }, 400);
    const isConfig = isConfigPath(p);

    // Config is committed verbatim — but a config file that doesn't parse
    // breaks the whole site build, so refuse it here and hand the editor the
    // parser's own message. Markdown is normalized through serializeMarkdown.
    let text: string;
    if (isConfig) {
      if (typeof configText !== "string")
        return json({ error: "text required for config files" }, 400);
      try {
        yaml.load(configText);
      } catch (e) {
        return json({ error: `YAML error — ${(e as Error).message}` }, 400);
      }
      text = configText;
    } else {
      text = serializeMarkdown(frontmatter ?? {}, body ?? "");
    }

    const branch = branchName(who.email, base);
    await gh.ensureBranch(branch, base);
    // AUTO-FIX every style rule with a deterministic suggestion before
    // committing; only unfixable findings come back as warnings. Rules are
    // chapter-owned content — if the rules file is missing or broken, saves
    // still succeed, just unlinted.
    let lint: ReturnType<typeof lintText> = [];
    let autofixed = 0;
    try {
      const rulesRaw = await gh.readItem(
        "content/config/style-rules.yaml",
        base,
      );
      const rules = yaml.load(rulesRaw.text) as StyleRule[];
      const before = lintText(text, rules).length;
      const fixed = fixText(text, rules);
      // A style fix is a blind text replacement, so on YAML it could in
      // principle land inside a key or break quoting. Keep it only if the file
      // still parses; otherwise commit what the editor actually wrote.
      if (!isConfig || parsesAsYaml(fixed)) text = fixed;
      lint = lintText(text, rules);
      autofixed = before - lint.length;
    } catch {
      /* no rules — no findings */
    }
    // `sha` is the blob the editor loaded. When present this becomes an
    // optimistic-concurrency write: a stale tab, or the same person editing in
    // two windows, gets a 409 instead of silently discarding the newer copy.
    // The draft branch belongs to ONE editor, so this is the only way a
    // same-branch conflict arises — a moved base is reported separately.
    let saved;
    try {
      saved = await gh.commit({
        branch,
        path: p,
        text,
        message: `edit ${p} (via editor)`,
        author: who,
        expectedSha: expectedSha,
      });
    } catch (e) {
      if (e instanceof ConflictError)
        return json(
          {
            error:
              "This file changed since you opened it — probably another tab, " +
              "or a publish that landed in between. Reload to get the current " +
              "version, or save to a new branch to keep both.",
            conflict: true,
            currentSha: e.currentSha,
          },
          409,
        );
      throw e;
    }
    const { commitSha, sha } = saved;
    return json({
      branch,
      commitSha,
      sha,
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
    const draft = branchName(who.email, base);
    if (await gh.branchExists(draft)) await gh.deleteBranch(draft);
    return json({ discarded: draft });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health reports configuration and never touches content, so it stays
    // reachable — it is how you diagnose a locked-out editor. It deliberately
    // reports whether Access is enforced.
    if (url.pathname === "/api/health")
      return json({
        ...(await health(env)),
        unprotected: unprotectedReason(env),
      });

    if (url.pathname.startsWith("/api/")) {
      try {
        // Every other route requires a verified identity. Failing closed is the
        // point: an unconfigured Access application must not look like a
        // working one.
        const who = await authenticate(request, env);
        return await handleApi(request, env, url.pathname, who);
      } catch (e) {
        if (e instanceof AccessDenied)
          return json({ error: e.message }, e.status);
        return json({ error: (e as Error).message }, 500);
      }
    }
    // Non-API paths are served by the Static Assets binding (run_worker_first
    // only routes /api/* here); reaching this is unexpected.
    return new Response("Not found", { status: 404 });
  },
};
