/**
 * Interactive setup walkthrough for the WYSIWYG editor's Phase 2 infra
 * (see plans/svdsa-wysiwyg-phase0.md). Guides creating the GitHub App,
 * deploying the `svdsa-edit` Worker, setting its secrets, and wiring
 * Cloudflare Access.
 *
 *   bun run setup:editor
 *
 * IMPORTANT: this tool NEVER sees your secrets. For anything sensitive it
 * prints the exact `wrangler secret put …` command for you to run — wrangler
 * prompts for the value (or reads a piped file), so the secret goes straight
 * into Cloudflare, never through this script, a file, or shell history.
 *
 * Interactive in a TTY (walks you step by step, remembers progress in
 * .editor-setup.local.json). Piped/non-TTY, it just prints the whole checklist.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const STATE = join(import.meta.dirname, "..", ".editor-setup.local.json");
const WORKER = "svdsa-edit";

interface Step {
  id: string;
  title: string;
  detail: string[];
  commands?: string[];
}

const steps: Step[] = [
  {
    id: "prereqs",
    title: "Prerequisites",
    detail: [
      "You'll need: the repo checked out, Bun installed, and a Cloudflare login.",
      "Log in to wrangler if you haven't (opens a browser):",
    ],
    commands: ["bunx wrangler login"],
  },
  {
    id: "gh-app-create",
    title: "Create the GitHub App (the editor's bot credential)",
    detail: [
      "Open: https://github.com/settings/apps/new",
      "  • Name: svdsa-edit  •  Homepage: https://github.com/cinderblock/svdsa.org",
      "  • Uncheck 'Webhook → Active' (we don't need webhooks).",
      "  • Repository permissions: Contents = Read & write,",
      "    Pull requests = Read & write, Metadata = Read (auto).",
      "  • 'Where can this be installed': Only on this account.",
      "Create it, then: 'Generate a private key' (downloads a .pem — keep it safe).",
      "Note the App ID shown near the top of the app's settings page.",
    ],
  },
  {
    id: "gh-app-install",
    title: "Install the App on the repo",
    detail: [
      "On the App page → 'Install App' → install on cinderblock/svdsa.org",
      "  (select 'Only select repositories' → svdsa.org).",
      "After installing, the URL is .../installations/<INSTALLATION_ID> —",
      "note that INSTALLATION_ID number.",
    ],
  },
  {
    id: "deploy-worker",
    title: "Deploy the svdsa-edit Worker skeleton",
    detail: [
      "The editor Worker must exist before you can set its secrets.",
      "(Scaffolded in the repo under editor/ — deploy it once:)",
    ],
    commands: ["cd editor && bunx wrangler deploy"],
  },
  {
    id: "set-secrets",
    title: "Set the Worker secrets (values entered in YOUR terminal)",
    detail: [
      "Run each from the editor/ directory. wrangler prompts for the value; the",
      "private key is piped straight from the .pem file you downloaded.",
      "Nothing sensitive passes through this tool.",
    ],
    commands: [
      "cd editor",
      "bunx wrangler secret put GH_APP_ID           # paste the App ID number",
      "bunx wrangler secret put GH_INSTALLATION_ID  # paste the Installation ID",
      "bunx wrangler secret put GH_PRIVATE_KEY < ~/Downloads/svdsa-edit.*.private-key.pem",
    ],
  },
  {
    id: "cf-access",
    title: "Put Cloudflare Access in front of the editor",
    detail: [
      "Cloudflare dashboard → Zero Trust → Access → Applications → Add →",
      "Self-hosted. Application domain = the editor's URL",
      `  (e.g. ${WORKER}.<your-subdomain>.workers.dev).`,
      "Identity: enable One-time PIN (email) and/or Google.",
      "Policy: Allow, Include = the editors' emails (or an email domain).",
      "Then note the app's AUD tag and your team domain",
      "  (https://<team>.cloudflareaccess.com) — the Worker verifies the",
      "  Access JWT against these. Set them (not secret, but simplest as vars):",
    ],
    commands: [
      "cd editor",
      "bunx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # e.g. yourteam.cloudflareaccess.com",
      "bunx wrangler secret put CF_ACCESS_AUD           # the application AUD tag",
    ],
  },
  {
    id: "verify",
    title: "Verify",
    detail: [
      "Redeploy so secrets are picked up, then open the editor URL — you should",
      "hit the Access login, then the editor. Try editing an item; it should",
      "create a draft/ branch and a preview build.",
    ],
    commands: [
      "cd editor && bunx wrangler deploy",
      "bunx wrangler secret list",
    ],
  },
];

// ---- rendering --------------------------------------------------------------

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function renderStep(step: Step, n: number, done: boolean) {
  const mark = done ? c.green("✔") : c.dim("▢");
  console.log(`\n${mark} ${c.bold(`${n}. ${step.title}`)}`);
  for (const line of step.detail) console.log(`   ${line}`);
  for (const cmd of step.commands ?? [])
    console.log(`     ${c.cyan("$ " + cmd)}`);
}

async function loadState(): Promise<Set<string>> {
  try {
    const data = JSON.parse(await readFile(STATE, "utf8")) as {
      done?: string[];
    };
    return new Set(data.done ?? []);
  } catch {
    return new Set();
  }
}
async function saveState(done: Set<string>) {
  await writeFile(STATE, JSON.stringify({ done: [...done] }, null, 2) + "\n");
}

console.log(c.bold("\nSVDSA editor — Phase 2 setup walkthrough"));
console.log(
  c.dim("This tool never sees secret values (see the header comment).\n"),
);

if (!process.stdin.isTTY) {
  console.log(c.dim("(non-interactive: printing the full checklist)"));
  steps.forEach((s, i) => renderStep(s, i + 1, false));
  console.log(
    c.dim(
      `\nRun in a terminal (bun run setup:editor) to check off steps as you go.\n`,
    ),
  );
  process.exit(0);
}

// Node readline (reliable under `bun run` in a TTY; the global prompt() does
// not block here).
const rl = createInterface({ input: process.stdin, output: process.stdout });
const done = await loadState();
for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  renderStep(step, i + 1, done.has(step.id));
  const ans = (
    await rl.question(`   ${c.dim("[enter]=done  s=skip  q=quit")} `)
  )
    .trim()
    .toLowerCase();
  if (ans === "q") break;
  if (ans === "s") continue;
  done.add(step.id);
  await saveState(done);
}
rl.close();

const remaining = steps.filter((s) => !done.has(s.id)).length;
console.log(
  remaining === 0
    ? c.green("\nAll steps done. The editor should be live behind Access. 🌹\n")
    : c.dim(
        `\n${remaining} step(s) left — re-run bun run setup:editor to continue.\n`,
      ),
);
