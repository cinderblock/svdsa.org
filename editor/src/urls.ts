/**
 * Where a given branch of the site can be read.
 *
 * Both the site and this editor are Workers on the same account, so their
 * hostnames differ only in the first label: `<worker>.<subdomain>.workers.dev`.
 * Everything here derives from the editor's OWN request host plus `SITE_WORKER`,
 * so moving accounts or renaming a Worker is a config change, not a code change.
 *
 * Pure functions in their own module because the production-vs-preview rule
 * below is a real invariant that got broken once, and the browser tests stub
 * `/api/*` — they cannot see a Worker-side URL bug. `tests/preview-urls.spec.ts`
 * covers this directly.
 */

export interface SiteUrlEnv {
  SITE_WORKER?: string;
}

function siteHostParts(requestUrl: string, env: SiteUrlEnv) {
  const [, ...rest] = new URL(requestUrl).host.split(".");
  return { worker: env.SITE_WORKER ?? "site", rest: rest.join(".") };
}

/** Origin of the production site — the Worker's own hostname. No trailing slash. */
export function siteOrigin(requestUrl: string, env: SiteUrlEnv): string {
  const { worker, rest } = siteHostParts(requestUrl, env);
  return `https://${worker}${rest ? `.${rest}` : ""}`;
}

/**
 * Cloudflare lowercases the branch and collapses every run of non-alphanumeric
 * characters to a hyphen when it forms a Workers Builds alias.
 */
export function branchAlias(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Workers Builds preview URL for a NON-production branch. */
export function previewUrl(
  requestUrl: string,
  env: SiteUrlEnv,
  branch: string,
): string {
  const { worker, rest } = siteHostParts(requestUrl, env);
  return `https://${branchAlias(branch)}-${worker}${rest ? `.${rest}` : ""}/`;
}

/**
 * Where to send someone who wants to LOOK at this branch.
 *
 * The rule that is easy to get wrong: Workers Builds gives the
 * `<alias>-<worker>` hostname only to non-production branches. The production
 * branch deploys to the Worker's own name, so asking for `red-site.<subdomain>`
 * yields a host that need not resolve at all.
 */
export function branchUrl(
  requestUrl: string,
  env: SiteUrlEnv,
  branch: string,
  production: string,
): string {
  return branch === production
    ? `${siteOrigin(requestUrl, env)}/`
    : previewUrl(requestUrl, env, branch);
}
