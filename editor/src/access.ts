/**
 * Who is allowed to use the editor.
 *
 * The editor commits to the chapter's repository as a trusted GitHub App, so
 * "who is making this request" is the ONLY thing standing between the public
 * internet and write access. That check used to be:
 *
 *     request.headers.get("Cf-Access-Authenticated-User-Email") ?? "editor@svdsa"
 *
 * which fails **open**: a plain header, trivially forged by anyone talking to
 * the Worker directly, and a default identity when it is absent — so a
 * misconfigured (or never-configured) Access application looks exactly like a
 * working one, silently.
 *
 * This module fails **closed** and verifies the signed assertion instead.
 * Cloudflare Access puts a JWT in `Cf-Access-Jwt-Assertion` (and the
 * `CF_Authorization` cookie), signed by the team's rotating RSA keys. We check
 * the signature against the team's JWKS, and the audience against this
 * application's AUD tag — the audience check is what stops a token minted for
 * some *other* application on the same team from working here.
 *
 * `REQUIRE_ACCESS: "false"` is a deliberate, visible escape hatch for an
 * environment where Access is not yet in front of the Worker. It leaves the
 * editor open to anyone who knows the URL; the UI says so in a banner. Absence
 * of the variable means enforce — the insecure state has to be written down.
 */

export interface AccessEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  REQUIRE_ACCESS?: string;
}

export interface Identity {
  name: string;
  email: string;
}

/** Rejected requests carry an HTTP status so the Worker can pass it through. */
export class AccessDenied extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}

/** Accepts "team", "team.cloudflareaccess.com" or a full URL. */
export function teamOrigin(domain: string): string {
  const d = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${d.includes(".") ? d : `${d}.cloudflareaccess.com`}`;
}

export function enforcing(env: AccessEnv): boolean {
  return (env.REQUIRE_ACCESS ?? "true").toLowerCase() !== "false";
}

/** Why the editor is unprotected, or null when it is protected. */
export function unprotectedReason(env: AccessEnv): string | null {
  if (!enforcing(env)) return "REQUIRE_ACCESS is set to false";
  if (!env.CF_ACCESS_TEAM_DOMAIN) return "CF_ACCESS_TEAM_DOMAIN is not set";
  if (!env.CF_ACCESS_AUD) return "CF_ACCESS_AUD is not set";
  return null;
}

// Built via the constructor rather than Uint8Array.from: the latter is typed
// over ArrayBufferLike, which isn't assignable to crypto.subtle's BufferSource.
const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  // Backed by an explicit ArrayBuffer: the default Uint8Array type is generic
  // over ArrayBufferLike, which crypto.subtle's BufferSource won't accept.
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const b64urlToJson = (s: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

/**
 * Access rotates its signing keys, so the JWKS is cached briefly rather than
 * pinned. Module scope means the cache lives as long as the isolate.
 */
let jwksCache: { origin: string; at: number; keys: Map<string, CryptoKey> } = {
  origin: "",
  at: 0,
  keys: new Map(),
};
const JWKS_TTL_MS = 15 * 60 * 1000;

async function signingKeys(
  origin: string,
  now: number,
): Promise<Map<string, CryptoKey>> {
  if (jwksCache.origin === origin && now - jwksCache.at < JWKS_TTL_MS)
    return jwksCache.keys;

  const res = await fetch(`${origin}/cdn-cgi/access/certs`);
  if (!res.ok)
    throw new AccessDenied(`could not fetch Access keys (${res.status})`, 502);
  const { keys = [] } = (await res.json()) as { keys?: Jwk[] };

  const imported = new Map<string, CryptoKey>();
  for (const k of keys) {
    if (k.kty !== "RSA") continue;
    imported.set(
      k.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  }
  jwksCache = { origin, at: now, keys: imported };
  return imported;
}

/** Small skew allowance so a correct token isn't rejected on a clock edge. */
const SKEW_S = 60;

/**
 * Verify an Access JWT and return the identity it asserts.
 * Exported for tests, which sign tokens with a locally generated key pair.
 */
export async function verifyAccessJwt(
  token: string,
  opts: {
    origin: string;
    aud: string;
    now?: number;
    keys?: Map<string, CryptoKey>;
  },
): Promise<Identity> {
  const now = opts.now ?? Date.now();
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessDenied("malformed Access token", 401);
  const [rawHeader, rawPayload, rawSig] = parts;

  const header = b64urlToJson(rawHeader);
  if (header.alg !== "RS256")
    throw new AccessDenied(`unsupported token alg ${String(header.alg)}`, 401);

  const keys = opts.keys ?? (await signingKeys(opts.origin, now));
  const key = keys.get(String(header.kid));
  if (!key) throw new AccessDenied("token signed by an unknown key", 401);

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!ok) throw new AccessDenied("bad Access token signature", 401);

  const claims = b64urlToJson(rawPayload) as {
    aud?: string | string[];
    email?: string;
    exp?: number;
    nbf?: number;
    iss?: string;
  };

  // The audience check is the important one: without it, a token for ANY
  // application on the same Access team would open this one.
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud ?? ""];
  if (!aud.includes(opts.aud))
    throw new AccessDenied("token is for a different application", 403);
  if (claims.iss && claims.iss !== opts.origin)
    throw new AccessDenied("token issued by a different Access team", 403);

  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp === "number" && nowS > claims.exp + SKEW_S)
    throw new AccessDenied("Access token expired", 401);
  if (typeof claims.nbf === "number" && nowS + SKEW_S < claims.nbf)
    throw new AccessDenied("Access token not yet valid", 401);

  const email = (claims.email ?? "").trim().toLowerCase();
  if (!email) throw new AccessDenied("Access token carries no email", 403);
  return { name: email, email };
}

/**
 * The identity for this request, or a throw. Never returns a fallback.
 */
export async function authenticate(
  request: Request,
  env: AccessEnv,
): Promise<Identity> {
  const header = request.headers
    .get("Cf-Access-Authenticated-User-Email")
    ?.trim()
    .toLowerCase();

  if (!enforcing(env)) {
    // Unprotected mode: the header is all there is, and it is forgeable. The
    // UI shows a banner; this exists so a not-yet-configured deployment is
    // usable, not so it is safe.
    return { name: header || "editor@svdsa", email: header || "editor@svdsa" };
  }

  const domain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!domain || !aud)
    throw new AccessDenied(
      "Editor is misconfigured: Cloudflare Access is required but " +
        "CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD are unset. Refusing to serve.",
      503,
    );

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token)
    throw new AccessDenied("not signed in through Cloudflare Access", 401);

  const id = await verifyAccessJwt(token, { origin: teamOrigin(domain), aud });

  // The header is only a convenience; if it disagrees with the signed token,
  // something is proxying or forging. Trust the signature.
  if (header && header !== id.email)
    throw new AccessDenied("Access identity mismatch", 403);
  return id;
}
