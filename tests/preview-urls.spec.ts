/**
 * Where the editor sends you to LOOK at a branch.
 *
 * These are the Worker's own pure functions, tested directly: the browser specs
 * stub `/api/*`, so a wrong URL computed server-side is invisible to them. That
 * is not hypothetical — the branch browser shipped linking production to
 * `red-site.…`, a hostname Workers Builds never creates.
 */

import { test, expect } from "@playwright/test";
import {
  branchAlias,
  branchUrl,
  previewUrl,
  siteOrigin,
} from "../editor/src/urls";

/** The editor's own URL is the input everything is derived from. */
const EDIT = "https://edit.cameron-test-svdsa.workers.dev/api/branch-info";
const ENV = { SITE_WORKER: "site" };

test("the live site is the Worker's own hostname", () => {
  expect(siteOrigin(EDIT, ENV)).toBe(
    "https://site.cameron-test-svdsa.workers.dev",
  );
});

test("a non-production branch gets its Workers Builds alias", () => {
  expect(branchUrl(EDIT, ENV, "theme/faithful", "red")).toBe(
    "https://theme-faithful-site.cameron-test-svdsa.workers.dev/",
  );
  expect(branchUrl(EDIT, ENV, "draft/cameron/red", "red")).toBe(
    "https://draft-cameron-red-site.cameron-test-svdsa.workers.dev/",
  );
});

test("the PRODUCTION branch is not an aliased preview", () => {
  // The bug: `red-site.…` is a host Workers Builds does not create, because the
  // production branch deploys to the Worker's own name.
  expect(branchUrl(EDIT, ENV, "red", "red")).toBe(
    "https://site.cameron-test-svdsa.workers.dev/",
  );
  expect(branchUrl(EDIT, ENV, "red", "red")).not.toContain("red-site");

  // And it follows the production branch, rather than hard-coding "red".
  expect(branchUrl(EDIT, ENV, "main", "main")).toBe(
    "https://site.cameron-test-svdsa.workers.dev/",
  );
  expect(branchUrl(EDIT, ENV, "red", "main")).toBe(
    "https://red-site.cameron-test-svdsa.workers.dev/",
  );
});

test("aliases match how Cloudflare mangles a branch name", () => {
  expect(branchAlias("theme/Midnight_Rose")).toBe("theme-midnight-rose");
  expect(branchAlias("feat/RED--v2/")).toBe("feat-red-v2");
});

test("the site Worker's name is configuration, not a constant", () => {
  // Renaming the Worker or moving accounts must not need a code change.
  expect(siteOrigin(EDIT, { SITE_WORKER: "svdsa" })).toBe(
    "https://svdsa.cameron-test-svdsa.workers.dev",
  );
  expect(
    branchUrl(
      "https://edit.example.com/x",
      { SITE_WORKER: "www" },
      "red",
      "red",
    ),
  ).toBe("https://www.example.com/");
});
