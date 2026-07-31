import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds the editor SPA (web/) → dist/, served by the `edit` Worker's Static
// Assets binding. The Worker owns /api/*; assets serve everything else.
//
// This is the `@svdsa/editor` workspace's OWN config, so `bun run dev|build`
// from this directory is the normal entry point — which is what lets Cloudflare
// Workers Builds use `editor` as its root directory with no custom flags.
// Paths stay anchored to this file rather than the CWD, so the root-level
// convenience scripts (`bun run editor:build`) behave identically.
export default defineConfig({
  root: fileURLToPath(new URL("web", import.meta.url)),
  // Keep the dep-optimization cache at the package root (Vite would otherwise
  // put it under web/), and separate from the SITE's: when both dev servers
  // shared one cache, concurrent optimize passes clobbered each other and broke
  // client JS on whichever server lost the race.
  cacheDir: fileURLToPath(new URL("node_modules/.vite", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("dist", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 9998,
    strictPort: true,
    // Proxy API calls to a locally-running `wrangler dev` during SPA dev.
    // NOTE the `^/api/` regex: a plain "/api" key matches by PREFIX, which also
    // swallowed this app's own `api.ts` module and broke the dev server.
    proxy: {
      "^/api/": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
