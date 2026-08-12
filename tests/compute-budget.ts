/**
 * Claim this run's share of the machine before any browser starts.
 *
 * A Playwright run is the heaviest thing this repo does: every worker drives a
 * real browser, several OS processes each. On a working computer that is also
 * running other projects' dev servers — and possibly another agent's test run —
 * nothing else stops two suites from starting at once.
 *
 * That matters beyond politeness, because contention makes RESULTS WRONG. Under
 * load an ordinary wait becomes a timeout, and a timeout reads exactly like a
 * regression. Measured 2026-08-11: 14 specs failed with two concurrent runs and
 * every one of them passed when run alone. Half an hour went into re-running
 * them to find that out.
 *
 * The budget is machine-wide and lives outside this repo
 * (`~/.claude/bin/cpu-slots.mjs`), because the collision it prevents is between
 * PROJECTS, not within one. See that file, and the `compute-budget` skill.
 *
 * If the broker isn't installed — CI, a fresh clone, someone else's machine —
 * this says so once and carries on. A courtesy layer must never be the reason a
 * repo can't run its tests.
 */

import type { FullConfig } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BROKER = join(homedir(), ".claude", "bin", "cpu-slots.mjs");

export default async function globalSetup(config: FullConfig) {
  // CI gets a machine to itself; queueing there would only add latency.
  if (process.env.CI) return;

  let broker: {
    acquire: (
      want: number,
      label: string,
      opts?: { onWait?: (n: number, free: number, holders: unknown[]) => void },
    ) => Promise<(() => void) & { waitedMs: number }>;
    describeWait: (n: number, free: number, holders: unknown[]) => string;
    budget: () => number;
  };
  try {
    broker = await import(pathToFileURL(BROKER).href);
  } catch {
    console.warn(
      `cpu-slots: no machine budget at ${BROKER} — running unthrottled.`,
    );
    return;
  }

  // Claim exactly what we're about to spend: one slot per worker.
  const release = await broker.acquire(config.workers, "svdsa playwright", {
    onWait: (n, free, holders) =>
      console.warn(broker.describeWait(n, free, holders)),
  });
  if (release.waitedMs > 1000)
    console.warn(
      `cpu-slots: acquired ${config.workers}/${broker.budget()} after ${Math.round(
        release.waitedMs / 1000,
      )}s`,
    );

  return release;
}
