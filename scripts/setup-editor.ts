/**
 * Interactive setup walkthrough for the WYSIWYG editor's Phase 2 infra
 * (see plans/svdsa-wysiwyg-phase0.md). Guides creating the GitHub App,
 * deploying the `svdsa-edit` Worker, setting its secrets, and wiring
 * Cloudflare Access.
 *
 *   bun run setup:editor
 *
 * It PROMPTS for (and regex-validates) the NON-secret identifiers — App ID,
 * Installation ID, Access team domain, AUD — remembers them in
 * .editor-setup.local.json (gitignored), and inlines them into ready-to-run
 * commands. It NEVER handles true secrets (the GitHub App private key, tokens):
 * those are entered via `wrangler secret put …` in your own terminal (wrangler
 * prompts / reads a piped file), so the secret goes straight to Cloudflare —
 * never through this script, its state file, or shell history.
 *
 * Interactive in a TTY; prints the whole checklist when piped/non-TTY.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const STATE = join(import.meta.dirname, "..", ".editor-setup.local.json");
const WORKER = "svdsa-edit";

interface Ask {
  key: string;
  label: string;
  pattern: RegExp;
  hint: string;
}
interface Step {
  id: string;
  title: string;
  detail: string[];
  /** Non-secret values to prompt for + validate (never secrets). */
  ask?: Ask[];
  /** Commands to run. `{KEY}` is replaced with a captured value. */
  commands?: string[];
}

const steps: Step[] = [
  {
    id: "prereqs",
    title: "Prerequisites",
    detail: [
      "You'll need the repo checked out, Bun installed, and a Cloudflare login.",
      "Confirm the account is the one that hosts the production svdsa Worker.",
    ],
    commands: ["bunx wrangler login", "bunx wrangler whoami"],
  },
  {
    id: "gh-app-create",
    title: "Create the GitHub App (the editor's bot credential)",
    detail: [
      "Open: https://github.com/settings/apps/new",
      "  • Name: svdsa-edit  •  Homepage: https://github.com/cinderblock/svdsa.org",
      "  • Uncheck 'Webhook → Active'.",
      "  • Repository permissions: Contents = Read & write,",
      "    Pull requests = Read & write, Metadata = Read (auto).",
      "  • 'Where can this be installed': Only on this account.",
      "Create it, then 'Generate a private key' (downloads a .pem — keep it safe;",
      "it's the only real secret and is entered later straight from the file).",
    ],
    ask: [
      {
        key: "GH_APP_ID",
        label: "GitHub App ID",
        pattern: /^\d{5,}$/,
        hint: "the numeric App ID near the top of the app settings page",
      },
    ],
  },
  {
    id: "gh-app-install",
    title: "Install the App on the repo",
    detail: [
      "On the App page → 'Install App' → install on cinderblock/svdsa.org",
      "  (select 'Only select repositories' → svdsa.org).",
      "After installing, the URL ends in /installations/<number>.",
    ],
    ask: [
      {
        key: "GH_INSTALLATION_ID",
        label: "Installation ID",
        pattern: /^\d{5,}$/,
        hint: "the number at the end of the install URL",
      },
    ],
  },
  {
    id: "deploy-worker",
    title: "Deploy the svdsa-edit Worker skeleton",
    detail: ["The Worker must exist before its secrets can be set."],
    commands: ["cd editor && bunx wrangler deploy"],
  },
  {
    id: "set-secrets",
    title: "Set the Worker config + secret",
    detail: [
      "The App ID / Installation ID below are non-secret and are filled in from",
      "what you entered. GH_PRIVATE_KEY is the only real secret — it's piped",
      "straight from the .pem file and never seen by this tool.",
      "Run from the editor/ directory:",
    ],
    commands: [
      "cd editor",
      'echo "{GH_APP_ID}" | bunx wrangler secret put GH_APP_ID',
      'echo "{GH_INSTALLATION_ID}" | bunx wrangler secret put GH_INSTALLATION_ID',
      "bunx wrangler secret put GH_PRIVATE_KEY < ~/Downloads/svdsa-edit.*.private-key.pem",
    ],
  },
  {
    id: "cf-access",
    title: "Put Cloudflare Access in front of the editor",
    detail: [
      "Cloudflare dashboard → Zero Trust → Access → Applications → Add →",
      "Self-hosted. Application domain = the editor URL",
      `  (e.g. ${WORKER}.<your-subdomain>.workers.dev).`,
      "Identity: One-time PIN (email) and/or Google.",
      "Policy: Allow, Include = the editors' emails (or an email domain).",
      "Then read off the app's AUD tag and your team domain.",
    ],
    ask: [
      {
        key: "CF_ACCESS_TEAM_DOMAIN",
        label: "Access team domain",
        pattern: /^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/i,
        hint: "e.g. yourteam.cloudflareaccess.com (host only)",
      },
      {
        key: "CF_ACCESS_AUD",
        label: "Access application AUD",
        pattern: /^[a-f0-9]{64}$/i,
        hint: "64 hex characters, from the Access app overview",
      },
    ],
    commands: [
      "cd editor",
      'echo "{CF_ACCESS_TEAM_DOMAIN}" | bunx wrangler secret put CF_ACCESS_TEAM_DOMAIN',
      'echo "{CF_ACCESS_AUD}" | bunx wrangler secret put CF_ACCESS_AUD',
    ],
  },
  {
    id: "verify",
    title: "Verify",
    detail: [
      "Redeploy so secrets are picked up, then open the editor URL — you should",
      "hit the Access login, then the editor.",
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
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

type Values = Record<string, string>;

function fill(cmd: string, values: Values): string {
  return cmd.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `<${k}>`);
}

function renderStep(step: Step, n: number, done: boolean, values: Values) {
  console.log(
    `\n${done ? c.green("✔") : c.dim("▢")} ${c.bold(`${n}. ${step.title}`)}`,
  );
  for (const line of step.detail) console.log(`   ${line}`);
  for (const cmd of step.commands ?? [])
    console.log(`     ${c.cyan("$ " + fill(cmd, values))}`);
}

interface State {
  done: string[];
  values: Values;
}
async function loadState(): Promise<State> {
  try {
    const s = JSON.parse(await readFile(STATE, "utf8")) as Partial<State>;
    return { done: s.done ?? [], values: s.values ?? {} };
  } catch {
    return { done: [], values: {} };
  }
}
const save = (s: State) => writeFile(STATE, JSON.stringify(s, null, 2) + "\n");

// ---- main -------------------------------------------------------------------

console.log(c.bold("\nSVDSA editor — Phase 2 setup walkthrough"));
console.log(
  c.dim("Prompts for non-secret IDs only; real secrets go via wrangler.\n"),
);

if (!process.stdin.isTTY) {
  console.log(c.dim("(non-interactive: printing the full checklist)"));
  steps.forEach((s, i) => {
    renderStep(s, i + 1, false, {});
    for (const a of s.ask ?? [])
      console.log(`     ${c.dim(`↳ you'll be asked: ${a.label} (${a.hint})`)}`);
  });
  console.log(
    c.dim(
      "\nRun in a terminal (bun run setup:editor) to fill values + check off.\n",
    ),
  );
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const state = await loadState();

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  renderStep(step, i + 1, state.done.includes(step.id), state.values);

  for (const a of step.ask ?? []) {
    const existing = state.values[a.key];
    while (true) {
      const shown = existing ? ` [${existing}]` : "";
      const ans = (
        await rl.question(
          `   ${a.label}${shown} ${c.dim("(" + a.hint + ")")}: `,
        )
      ).trim();
      if (ans === "" && existing) break; // keep existing
      if (ans === "") break; // skip for now
      if (a.pattern.test(ans)) {
        state.values[a.key] = ans;
        await save(state);
        break;
      }
      console.log(
        `   ${c.red("✗ that doesn't match " + a.pattern + " — try again, or Enter to skip")}`,
      );
    }
  }

  // Reprint commands now that values are captured.
  if (step.commands?.some((cmd) => /\{\w+\}/.test(cmd))) {
    console.log(c.dim("   → commands with your values:"));
    for (const cmd of step.commands)
      console.log(`     ${c.cyan("$ " + fill(cmd, state.values))}`);
  }

  const nav = (
    await rl.question(`   ${c.dim("[enter]=done  s=skip  q=quit")} `)
  )
    .trim()
    .toLowerCase();
  if (nav === "q") break;
  if (nav === "s") continue;
  if (!state.done.includes(step.id)) state.done.push(step.id);
  await save(state);
}
rl.close();

const remaining = steps.filter((s) => !state.done.includes(s.id)).length;
console.log(
  remaining === 0
    ? c.green("\nAll steps done. The editor should be live behind Access. 🌹\n")
    : c.dim(
        `\n${remaining} step(s) left — re-run bun run setup:editor to continue.\n`,
      ),
);
