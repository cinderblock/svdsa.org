/**
 * Setup orchestrator for the WYSIWYG editor's Phase 2 infra
 * (see plans/svdsa-wysiwyg-phase0.md).
 *
 *   bun run setup:editor
 *
 * It detects current state itself (wrangler whoami / secret list) and skips
 * anything already done — so re-running jumps straight to the first unfinished
 * step. It RUNS the commands for you (deploy, secrets) after a y/n prompt;
 * you only hand-enter the values it can't detect (App ID, Installation ID, the
 * .pem path, Access team domain + AUD), which are regex-validated.
 *
 * Secrets are never seen by this tool: the GitHub App private key is piped to
 * wrangler straight from the .pem file via shell redirection; non-secret IDs
 * are fed on stdin. Nothing sensitive is stored or logged. Non-secret IDs are
 * remembered in .editor-setup.local.json (gitignored). Read-only checks run
 * silently; every account-mutating command asks first (n → prints it instead).
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
const STATE = join(ROOT, ".editor-setup.local.json");

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
const ok = (s: string) => console.log(`${c.green("✔")} ${s}`);
const todo = (s: string) => console.log(`\n${c.bold("→ " + s)}`);

// ---- shell helpers ----------------------------------------------------------

/** Run a command via the shell. capture=true → silent, returns output. */
function sh(
  cmd: string,
  opts: { cwd?: string; capture?: boolean; input?: string } = {},
) {
  try {
    const r = spawnSync(cmd, {
      cwd: opts.cwd,
      shell: true,
      encoding: "utf8",
      input: opts.input,
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
async function confirmRun(
  label: string,
  cmd: string,
  cwd = EDITOR,
): Promise<boolean> {
  const ans = (await rl.question(`   run ${c.cyan(cmd)} ? ${c.dim("[Y/n]")} `))
    .trim()
    .toLowerCase();
  if (ans === "n" || ans === "no") {
    console.log(c.dim(`   skipped — run it yourself:  (cd ${cwd}) $ ${cmd}`));
    return false;
  }
  const r = sh(cmd, { cwd });
  if (r.code !== 0) console.log(c.red(`   command exited ${r.code}`));
  return r.code === 0;
}

async function askValue(
  label: string,
  pattern: RegExp,
  hint: string,
  existing?: string,
): Promise<string | undefined> {
  while (true) {
    const shown = existing ? ` [${existing}]` : "";
    const ans = (
      await rl.question(`   ${label}${shown} ${c.dim("(" + hint + ")")}: `)
    ).trim();
    if (ans === "") return existing; // keep/skip
    if (pattern.test(ans)) return ans;
    console.log(
      c.red(`   ✗ doesn't match ${pattern} — try again (Enter to skip)`),
    );
  }
}

// ---- state ------------------------------------------------------------------

type Values = Record<string, string>;
async function loadValues(): Promise<Values> {
  try {
    return (
      (JSON.parse(await readFile(STATE, "utf8")) as { values?: Values })
        .values ?? {}
    );
  } catch {
    return {};
  }
}
const saveValues = (values: Values) =>
  writeFile(STATE, JSON.stringify({ values }, null, 2) + "\n");

// ---- live checks ------------------------------------------------------------

function whoami(): string | null {
  const r = sh("bunx wrangler whoami", { capture: true });
  if (r.code !== 0 || /not authenticated/i.test(r.out)) return null;
  const m =
    r.out.match(/email\s+([^\s.]+@[^\s]+)/i) || r.out.match(/([^\s]+@[^\s]+)/);
  return m ? m[1] : "logged in";
}
/** Raw text of `wrangler secret list` for the editor Worker, or null if the
 *  Worker isn't deployed yet. */
function secretList(): string | null {
  const r = sh("bunx wrangler secret list", { cwd: EDITOR, capture: true });
  if (r.code !== 0) return null;
  return r.out;
}
const has = (list: string | null, name: string) =>
  !!list && list.includes(name);

// ---- steps ------------------------------------------------------------------

const ID = /^\d{5,}$/;
const TEAM = /^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/i;
const AUD = /^[a-f0-9]{64}$/i;

const CHECKLIST = [
  "1. wrangler login (auto-detected)",
  "2. Deploy the svdsa-edit Worker skeleton (auto)",
  "3. Create + install the GitHub App (browser) → App ID, Installation ID, .pem",
  "4. Set GitHub secrets (auto, from your values + the .pem)",
  "5. Create the Cloudflare Access app (browser) → team domain, AUD",
  "6. Set Access secrets (auto) + redeploy + verify",
];

async function stepLogin(): Promise<boolean> {
  const who = whoami();
  if (who) {
    ok(`Logged in to Cloudflare as ${who}`);
    console.log(
      c.dim("   (confirm this is the account hosting production svdsa)"),
    );
    return true;
  }
  todo("Log in to Cloudflare");
  return confirmRun("login", "bunx wrangler login", ROOT);
}

async function stepDeploy(): Promise<boolean> {
  if (secretList() !== null) {
    ok("svdsa-edit Worker is deployed");
    return true;
  }
  todo("Deploy the svdsa-edit Worker skeleton (must exist before secrets)");
  return confirmRun("deploy", "bunx wrangler deploy");
}

async function stepGithub(values: Values): Promise<void> {
  const secrets = secretList();
  if (
    has(secrets, "GH_APP_ID") &&
    has(secrets, "GH_INSTALLATION_ID") &&
    has(secrets, "GH_PRIVATE_KEY")
  ) {
    ok("GitHub App secrets are set");
    return;
  }
  todo("Create + install the GitHub App (browser), then I'll set the secrets");
  console.log("   https://github.com/settings/apps/new");
  console.log("     • Name: svdsa-edit  • Webhook: off");
  console.log(
    "     • Permissions: Contents R/W, Pull requests R/W, Metadata R",
  );
  console.log(
    "     • Install on cinderblock/svdsa.org, and 'Generate a private key' (.pem).",
  );

  const appId = await askValue("GitHub App ID", ID, "digits", values.GH_APP_ID);
  const instId = await askValue(
    "Installation ID",
    ID,
    "digits (end of install URL)",
    values.GH_INSTALLATION_ID,
  );
  if (appId) values.GH_APP_ID = appId;
  if (instId) values.GH_INSTALLATION_ID = instId;
  await saveValues(values);

  // .pem path (not secret — the file path). The key content is piped to
  // wrangler by the shell; this tool never reads it.
  let pem = (
    await rl.question(
      `   Path to the downloaded .pem ${c.dim("(drag it in / paste path)")}: `,
    )
  )
    .trim()
    .replace(/^["']|["']$/g, "");
  if (pem.startsWith("~")) pem = join(homedir(), pem.slice(1));
  const pemOk = pem
    ? await stat(pem)
        .then(() => true)
        .catch(() => false)
    : false;
  if (pem && !pemOk)
    console.log(
      c.red(`   ✗ no file at ${pem} — set GH_PRIVATE_KEY yourself later`),
    );

  if (appId)
    await confirmRun(
      "set app id",
      `echo ${appId} | bunx wrangler secret put GH_APP_ID`,
    );
  if (instId)
    await confirmRun(
      "set installation id",
      `echo ${instId} | bunx wrangler secret put GH_INSTALLATION_ID`,
    );
  if (pemOk)
    await confirmRun(
      "set private key (piped from the .pem)",
      `bunx wrangler secret put GH_PRIVATE_KEY < "${pem}"`,
    );
}

async function stepAccess(values: Values): Promise<void> {
  const secrets = secretList();
  if (has(secrets, "CF_ACCESS_TEAM_DOMAIN") && has(secrets, "CF_ACCESS_AUD")) {
    ok("Cloudflare Access secrets are set");
    return;
  }
  todo("Create the Cloudflare Access app (browser), then I'll set the secrets");
  console.log("   Zero Trust → Access → Applications → Add → Self-hosted");
  console.log(
    "     • Domain = the editor URL (svdsa-edit.<subdomain>.workers.dev)",
  );
  console.log(
    "     • Identity: One-time PIN / Google.  Policy: Allow = editor emails.",
  );

  const team = await askValue(
    "Access team domain",
    TEAM,
    "yourteam.cloudflareaccess.com",
    values.CF_ACCESS_TEAM_DOMAIN,
  );
  const aud = await askValue(
    "Access application AUD",
    AUD,
    "64 hex chars",
    values.CF_ACCESS_AUD,
  );
  if (team) values.CF_ACCESS_TEAM_DOMAIN = team;
  if (aud) values.CF_ACCESS_AUD = aud;
  await saveValues(values);

  if (team)
    await confirmRun(
      "set team domain",
      `echo ${team} | bunx wrangler secret put CF_ACCESS_TEAM_DOMAIN`,
    );
  if (aud)
    await confirmRun(
      "set aud",
      `echo ${aud} | bunx wrangler secret put CF_ACCESS_AUD`,
    );
}

async function stepVerify(): Promise<void> {
  todo("Redeploy (pick up secrets) + verify");
  await confirmRun("redeploy", "bunx wrangler deploy");
  console.log(
    c.dim(
      "   Open the editor URL — you should hit the Access login, then the editor.",
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
const values = await loadValues();

if (await stepLogin()) {
  await stepDeploy();
  await stepGithub(values);
  await stepAccess(values);
  await stepVerify();
}
rl.close();

const s = secretList();
const remaining = [
  "GH_APP_ID",
  "GH_INSTALLATION_ID",
  "GH_PRIVATE_KEY",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
].filter((n) => !has(s, n));
console.log(
  remaining.length === 0
    ? c.green("\nAll set — the editor should be live behind Access. 🌹\n")
    : c.dim(`\nStill to do: ${remaining.join(", ")} — re-run to continue.\n`),
);
