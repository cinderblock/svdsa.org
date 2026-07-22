/**
 * Setup orchestrator for the WYSIWYG editor's Phase 2 infra
 * (see plans/svdsa-wysiwyg-phase0.md).
 *
 *   bun run setup:editor
 *
 * It detects current state itself (wrangler whoami / secret list, and the
 * committed vars in editor/wrangler.jsonc) and skips anything already done, so
 * re-running jumps to the first unfinished step. It runs the account commands
 * for you (deploy, the private-key secret) after a y/n; declining prints the
 * command instead.
 *
 * Non-secret config — App ID, Installation ID, Access team domain, AUD — are
 * plain **variables**, written into editor/wrangler.jsonc `vars` (safe to
 * commit; applied on deploy). The ONLY secret is the GitHub App private key: it
 * is piped to wrangler straight from the .pem via shell redirection, so this
 * tool never reads it. Nothing sensitive is stored or logged.
 *
 * Prints a static checklist when piped/non-TTY (runs nothing).
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface, type Interface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const EDITOR = join(ROOT, "editor");
const WRANGLER = join(EDITOR, "wrangler.jsonc");

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
const ok = (s: string) => console.log(`${c.green("✔")} ${s}`);
const todo = (s: string) => console.log(`\n${c.bold("→ " + s)}`);

// ---- shell + prompts --------------------------------------------------------

function sh(cmd: string, opts: { cwd?: string; capture?: boolean } = {}) {
  try {
    const r = spawnSync(cmd, {
      cwd: opts.cwd,
      shell: true,
      encoding: "utf8",
      stdio: opts.capture
        ? ["pipe", "pipe", "pipe"]
        : ["inherit", "inherit", "inherit"],
    });
    return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  } catch {
    return { code: 1, out: "" };
  }
}

let rl: Interface;
async function confirmRun(cmd: string, cwd = EDITOR): Promise<boolean> {
  const ans = (await rl.question(`   run ${c.cyan(cmd)} ? ${c.dim("[Y/n]")} `))
    .trim()
    .toLowerCase();
  if (ans === "n" || ans === "no") {
    console.log(c.dim(`   skipped — run yourself: (cd ${cwd}) $ ${cmd}`));
    return false;
  }
  const r = sh(cmd, { cwd });
  if (r.code !== 0) console.log(c.red(`   exited ${r.code}`));
  return r.code === 0;
}

async function askValue(
  label: string,
  pattern: RegExp,
  hint: string,
  existing: string,
): Promise<string> {
  while (true) {
    const shown = existing ? ` [${existing}]` : "";
    const ans = (
      await rl.question(`   ${label}${shown} ${c.dim("(" + hint + ")")}: `)
    ).trim();
    if (ans === "") return existing;
    if (pattern.test(ans)) return ans;
    console.log(
      c.red(`   ✗ doesn't match ${pattern} — try again (Enter to keep/skip)`),
    );
  }
}

// ---- wrangler.jsonc vars (non-secret config) --------------------------------

const readWrangler = () => readFile(WRANGLER, "utf8");
function getVar(text: string, key: string): string {
  return text.match(new RegExp(`"${key}":\\s*"([^"]*)"`))?.[1] ?? "";
}
async function setVar(key: string, value: string) {
  const text = await readWrangler();
  await writeFile(
    WRANGLER,
    text.replace(new RegExp(`("${key}":\\s*)"[^"]*"`), `$1"${value}"`),
  );
  ok(`set var ${key} in editor/wrangler.jsonc`);
}

// ---- live checks (account) --------------------------------------------------

function whoami(): string | null {
  const r = sh("bunx wrangler whoami", { capture: true });
  if (r.code !== 0 || /not authenticated/i.test(r.out)) return null;
  return r.out.match(/([^\s]+@[^\s]+)/)?.[1] ?? "logged in";
}
/** `wrangler secret list` text, or null if the Worker isn't deployed. */
function secretList(): string | null {
  const r = sh("bunx wrangler secret list", { cwd: EDITOR, capture: true });
  return r.code === 0 ? r.out : null;
}

const ID = /^\d{5,}$/;
// Accept the domain with or without scheme/trailing slash (Custom Pages shows
// it as https://yourteam.cloudflareaccess.com); we store the bare host.
const TEAM = /^(https?:\/\/)?[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com\/?$/i;
const AUD = /^[a-f0-9]{64}$/i;

const CHECKLIST = [
  "1. wrangler login (auto-detected)",
  "2. GitHub App (browser) → App ID + Installation ID become vars",
  "3. Cloudflare Access app (browser) → team domain + AUD become vars",
  "4. Deploy the svdsa-edit Worker (auto; applies the vars)",
  "5. Set GH_PRIVATE_KEY secret from the .pem (auto; the only secret)",
  "6. Redeploy + verify",
];

// ---- steps ------------------------------------------------------------------

async function stepLogin(): Promise<boolean> {
  const who = whoami();
  if (who) {
    ok(`Cloudflare login: ${who}`);
    console.log(
      c.dim("   (confirm this is the account hosting production svdsa)"),
    );
    return true;
  }
  todo("Log in to Cloudflare");
  return confirmRun("bunx wrangler login", ROOT);
}

async function stepGithubVars(): Promise<void> {
  const t = await readWrangler();
  if (getVar(t, "GH_APP_ID") && getVar(t, "GH_INSTALLATION_ID")) {
    ok("GitHub App vars set (GH_APP_ID, GH_INSTALLATION_ID)");
    return;
  }
  todo("Create + install the GitHub App (browser)");
  console.log(
    "   https://github.com/settings/apps/new — Name svdsa-edit, Webhook off,",
  );
  console.log(
    "   Contents R/W + Pull requests R/W + Metadata R; install on cinderblock/svdsa.org;",
  );
  console.log(
    "   'Generate a private key' (.pem — the only secret, used later).",
  );
  const appId = await askValue(
    "GitHub App ID",
    ID,
    "digits",
    getVar(t, "GH_APP_ID"),
  );
  const instId = await askValue(
    "Installation ID",
    ID,
    "end of install URL",
    getVar(t, "GH_INSTALLATION_ID"),
  );
  if (appId) await setVar("GH_APP_ID", appId);
  if (instId) await setVar("GH_INSTALLATION_ID", instId);
}

async function stepAccessVars(): Promise<void> {
  const t = await readWrangler();
  todo(
    "Create the Cloudflare Access app (browser) — this is what gates the editor",
  );
  console.log("   Zero Trust → Access → Applications → Add → Self-hosted;");
  console.log(
    "   domain = svdsa-edit.<subdomain>.workers.dev; identity One-time PIN/Google;",
  );
  console.log("   policy Allow = editor emails.");
  console.log(
    c.dim(
      "   The two values below are OPTIONAL — only for stricter JWT pinning (a",
    ),
  );
  console.log(
    c.dim(
      "   later hardening step). The editor uses the Access-injected email for now.",
    ),
  );
  console.log(
    c.dim(
      "   Team domain: Settings → 'Team name and domain'. AUD: the app's Overview.",
    ),
  );
  const team = await askValue(
    "Access team domain",
    TEAM,
    "optional — Enter to skip; e.g. yourteam.cloudflareaccess.com",
    getVar(t, "CF_ACCESS_TEAM_DOMAIN"),
  );
  const aud = await askValue(
    "Access application AUD",
    AUD,
    "optional — Enter to skip; 64 hex chars",
    getVar(t, "CF_ACCESS_AUD"),
  );
  const teamHost = team.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (teamHost) await setVar("CF_ACCESS_TEAM_DOMAIN", teamHost);
  if (aud) await setVar("CF_ACCESS_AUD", aud);
}

async function stepDeploy(): Promise<void> {
  todo("Deploy the svdsa-edit Worker (creates it + applies the vars)");
  await confirmRun("bunx wrangler deploy");
}

async function stepKeySecret(): Promise<void> {
  if (secretList()?.includes("GH_PRIVATE_KEY")) {
    ok("GH_PRIVATE_KEY secret is set");
    return;
  }
  todo("Set the GitHub App private key (the only secret)");
  let pem = (
    await rl.question(
      `   Path to the .pem ${c.dim("(drag it in / paste path)")}: `,
    )
  )
    .trim()
    .replace(/^["']|["']$/g, "");
  if (pem.startsWith("~")) pem = join(homedir(), pem.slice(1));
  if (!pem) return console.log(c.dim("   skipped — set GH_PRIVATE_KEY later."));
  if (
    !(await stat(pem)
      .then(() => true)
      .catch(() => false))
  )
    return console.log(c.red(`   ✗ no file at ${pem}`));
  // The shell pipes the file to wrangler; this tool never reads the key.
  await confirmRun(`bunx wrangler secret put GH_PRIVATE_KEY < "${pem}"`);
}

async function stepVerify(): Promise<void> {
  todo("Redeploy + verify");
  await confirmRun("bunx wrangler deploy");
  console.log(
    c.dim(
      "   Open the editor URL — you should hit Access login, then the editor.",
    ),
  );
}

// ---- main -------------------------------------------------------------------

console.log(c.bold("\nSVDSA editor — Phase 2 setup"));

if (!process.stdin.isTTY) {
  console.log(
    c.dim("(non-interactive: checklist only; run in a terminal to execute)\n"),
  );
  for (const line of CHECKLIST) console.log(`  ▢ ${line}`);
  console.log(c.dim("\n  bun run setup:editor\n"));
  process.exit(0);
}

rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(c.dim("Detecting current state…"));

if (await stepLogin()) {
  await stepGithubVars();
  await stepAccessVars();
  await stepDeploy();
  await stepKeySecret();
  await stepVerify();
}
rl.close();

const t = await readWrangler();
const missingVars = [
  "GH_APP_ID",
  "GH_INSTALLATION_ID",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
].filter((k) => !getVar(t, k));
const keyMissing = !secretList()?.includes("GH_PRIVATE_KEY");
const remaining = [
  ...missingVars,
  ...(keyMissing ? ["GH_PRIVATE_KEY (secret)"] : []),
];
console.log(
  remaining.length === 0
    ? c.green("\nAll set — the editor should be live behind Access. 🌹\n")
    : c.dim(`\nStill to do: ${remaining.join(", ")} — re-run to continue.\n`),
);
