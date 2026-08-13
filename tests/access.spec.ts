/**
 * Cloudflare Access enforcement (editor/src/access.ts).
 *
 * The editor commits to the repository as a trusted GitHub App, so this check
 * is the only thing between the public internet and write access. It used to
 * be a bare `?? "editor@svdsa"` fallback on a forgeable header, which fails
 * OPEN — a never-configured Access application looked exactly like a working
 * one.
 *
 * These tests sign real RS256 tokens with a locally generated key pair, so the
 * verifier is exercised rather than trusted. Every negative case here is a way
 * an attacker could otherwise get in.
 */

import { test, expect } from "@playwright/test";
import {
  AccessDenied,
  authenticate,
  enforcing,
  teamOrigin,
  unprotectedReason,
  verifyAccessJwt,
} from "../editor/src/access";

const ORIGIN = "https://svdsa.cloudflareaccess.com";
const AUD = "aud-for-the-editor";
const KID = "test-key-1";

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlText = (s: string) =>
  b64url(new TextEncoder().encode(s) as Uint8Array);

/** One key pair for the whole file: the "Access team" signing key. */
async function makeSigner() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const keys = new Map([[KID, pair.publicKey]]);

  const sign = async (
    claims: Record<string, unknown>,
    header: Record<string, unknown> = {},
  ) => {
    const h = b64urlText(
      JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT", ...header }),
    );
    const p = b64urlText(JSON.stringify(claims));
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(`${h}.${p}`),
    );
    return `${h}.${p}.${b64url(sig)}`;
  };

  return { keys, sign };
}

const nowS = () => Math.floor(Date.now() / 1000);
const goodClaims = (over: Record<string, unknown> = {}) => ({
  aud: [AUD],
  email: "Member@SVDSA.org",
  iss: ORIGIN,
  exp: nowS() + 600,
  nbf: nowS() - 10,
  ...over,
});

test.describe("verifyAccessJwt", () => {
  test("accepts a properly signed token and normalizes the email", async () => {
    const { keys, sign } = await makeSigner();
    const id = await verifyAccessJwt(await sign(goodClaims()), {
      origin: ORIGIN,
      aud: AUD,
      keys,
    });
    expect(id.email).toBe("member@svdsa.org");
  });

  test("rejects a token signed by the wrong key", async () => {
    const a = await makeSigner();
    const b = await makeSigner(); // attacker's key, same kid
    await expect(
      verifyAccessJwt(await b.sign(goodClaims()), {
        origin: ORIGIN,
        aud: AUD,
        keys: a.keys,
      }),
    ).rejects.toThrow(/signature/);
  });

  test("rejects a token minted for a DIFFERENT Access application", async () => {
    // The whole point of the audience check: same team, different app.
    const { keys, sign } = await makeSigner();
    await expect(
      verifyAccessJwt(await sign(goodClaims({ aud: ["some-other-app"] })), {
        origin: ORIGIN,
        aud: AUD,
        keys,
      }),
    ).rejects.toThrow(/different application/);
  });

  test("rejects a token from another Access team", async () => {
    const { keys, sign } = await makeSigner();
    await expect(
      verifyAccessJwt(
        await sign(goodClaims({ iss: "https://evil.cloudflareaccess.com" })),
        { origin: ORIGIN, aud: AUD, keys },
      ),
    ).rejects.toThrow(/different Access team/);
  });

  test("rejects an expired token", async () => {
    const { keys, sign } = await makeSigner();
    await expect(
      verifyAccessJwt(await sign(goodClaims({ exp: nowS() - 3600 })), {
        origin: ORIGIN,
        aud: AUD,
        keys,
      }),
    ).rejects.toThrow(/expired/);
  });

  test("rejects alg:none — the classic JWT bypass", async () => {
    const { keys, sign } = await makeSigner();
    const token = await sign(goodClaims(), { alg: "none" });
    await expect(
      verifyAccessJwt(token, { origin: ORIGIN, aud: AUD, keys }),
    ).rejects.toThrow(/unsupported token alg/);
  });

  test("rejects a token with no email claim", async () => {
    const { keys, sign } = await makeSigner();
    await expect(
      verifyAccessJwt(await sign(goodClaims({ email: undefined })), {
        origin: ORIGIN,
        aud: AUD,
        keys,
      }),
    ).rejects.toThrow(/no email/);
  });
});

test.describe("authenticate", () => {
  const req = (headers: Record<string, string> = {}) =>
    new Request("https://edit.example/api/list", { headers });

  test("refuses a forged email header when enforcing", async () => {
    // This is exactly what the old code accepted.
    const env = {
      CF_ACCESS_TEAM_DOMAIN: "svdsa",
      CF_ACCESS_AUD: AUD,
    };
    await expect(
      authenticate(
        req({ "Cf-Access-Authenticated-User-Email": "attacker@evil.test" }),
        env,
      ),
    ).rejects.toThrow(/not signed in/);
  });

  test("refuses to serve when Access is required but unconfigured", async () => {
    // Fail closed: a missing configuration must not look like a working one.
    const err = (await authenticate(req(), {}).catch((e) => e)) as AccessDenied;
    expect(err).toBeInstanceOf(AccessDenied);
    expect(err.status).toBe(503);
  });

  test("enforces by default — the insecure state must be written down", () => {
    expect(enforcing({})).toBe(true);
    expect(enforcing({ REQUIRE_ACCESS: "false" })).toBe(false);
  });

  test("reports why the editor is unprotected", () => {
    expect(unprotectedReason({ REQUIRE_ACCESS: "false" })).toMatch(
      /REQUIRE_ACCESS/,
    );
    expect(unprotectedReason({ CF_ACCESS_AUD: AUD })).toMatch(/TEAM_DOMAIN/);
    expect(unprotectedReason({ CF_ACCESS_TEAM_DOMAIN: "svdsa" })).toMatch(
      /AUD/,
    );
    expect(
      unprotectedReason({ CF_ACCESS_TEAM_DOMAIN: "svdsa", CF_ACCESS_AUD: AUD }),
    ).toBeNull();
  });
});

test.describe("teamOrigin", () => {
  test("accepts a bare team name, a full domain, or a URL", () => {
    expect(teamOrigin("svdsa")).toBe(ORIGIN);
    expect(teamOrigin("svdsa.cloudflareaccess.com")).toBe(ORIGIN);
    expect(teamOrigin("https://svdsa.cloudflareaccess.com/")).toBe(ORIGIN);
  });
});
