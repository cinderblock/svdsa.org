/**
 * svdsa-edit Worker — the in-browser editor (Phase 2).
 *
 * Deployed separately from production `svdsa`, behind Cloudflare Access.
 * This slice proves the GitHub App credential works from the Worker
 * (`/api/health`); the content API (list/read/save-draft/publish) and the full
 * UI land in the next slices. See plans/svdsa-wysiwyg-phase0.md.
 */

import { createGitHub } from "./git/github";

export interface Env {
  GIT_HOST?: "github" | "gitlab";
  EDITOR_DEFAULT_BASE?: string; // default base branch to edit from (e.g. "red")
  GH_REPO?: string; // "owner/repo"
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string; // secret (PKCS#8)
  GITLAB_TOKEN?: string; // secret
  GITLAB_PROJECT_ID?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

/**
 * Editor identity. Behind Cloudflare Access, the authenticated email is
 * injected as a request header. Verifying the Access JWT (Cf-Access-Jwt-
 * Assertion) against the team certs is a hardening step tracked in the plan;
 * the header is trustworthy as long as the Worker is only reachable via the
 * Access-protected hostname.
 */
function editorEmail(request: Request): string | null {
  return request.headers.get("Cf-Access-Authenticated-User-Email");
}

/** Prove the GitHub App can authenticate + reach the repo from this Worker. */
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

function page(email: string | null, gitHost: string): string {
  const who = email
    ? `Signed in as <strong>${email}</strong>.`
    : "Not signed in.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SVDSA Editor</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.25rem;color:#191512}
h1{color:#c0141a}code{background:#f3efe9;padding:.1rem .35rem;border-radius:4px}
.ok{color:#166534}.err{color:#b91c1c}#h{white-space:pre-wrap}</style>
</head><body>
<h1>🌹 Silicon Valley DSA — Editor</h1>
<p>${who}</p>
<p>Git host: <code>${gitHost}</code></p>
<h2>GitHub App</h2>
<p id="h">checking…</p>
<script>
fetch("/api/health").then(r=>r.json()).then(h=>{
  const el=document.getElementById("h");
  if(h.ok){el.className="ok";el.textContent="✓ connected to "+h.repo+"  (default: "+h.defaultBranch+")\\n"+h.branches.length+" branches; base '"+h.base+"' "+(h.baseExists?"exists":"MISSING");}
  else{el.className="err";el.textContent="✗ "+h.error;}
});
</script>
<p class="muted">Phase 2 — auth check. The content editor lands next.</p>
</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const email = editorEmail(request);
    const gitHost = env.GIT_HOST ?? "github";

    if (url.pathname === "/api/whoami")
      return Response.json({ email, gitHost });
    if (url.pathname === "/api/health") return Response.json(await health(env));

    return new Response(page(email, gitHost), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
