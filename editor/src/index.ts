/**
 * svdsa-edit Worker — the in-browser editor (Phase 2 skeleton).
 *
 * Deployed separately from production `svdsa`, behind Cloudflare Access.
 * This slice is a deployable placeholder: it reports the Access-authenticated
 * editor and configured git host. The content API (list/read/save-draft/
 * publish) and UI land in the next slices, once the git-host credential exists
 * (see plans/svdsa-wysiwyg-phase0.md and `bun run setup:editor`).
 */

export interface Env {
  GIT_HOST?: "github" | "gitlab";
  // Secrets set via setup:editor — not present until configured:
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string;
  GITLAB_TOKEN?: string;
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

function page(email: string | null, gitHost: string): string {
  const who = email
    ? `Signed in as <strong>${email}</strong>.`
    : "Not signed in.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SVDSA Editor</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.25rem;color:#191512}
h1{color:#c0141a}code{background:#f3efe9;padding:.1rem .35rem;border-radius:4px}</style>
</head><body>
<h1>🌹 Silicon Valley DSA — Editor</h1>
<p>${who}</p>
<p>Git host: <code>${gitHost}</code></p>
<p class="muted">Phase 2 skeleton. The content editor lands in the next slice
once the git-host credential is configured.</p>
</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const email = editorEmail(request);
    const gitHost = env.GIT_HOST ?? "github";

    if (url.pathname === "/api/whoami") {
      return Response.json({ email, gitHost });
    }
    return new Response(page(email, gitHost), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
