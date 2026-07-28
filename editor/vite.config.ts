import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds the editor SPA (web/) → dist/, served by the svdsa-edit Worker's
// Static Assets binding. The Worker owns /api/*; assets serve everything else.
// Paths are anchored to this config's directory (not the CWD), since it's run
// from the repo root via `--config editor/vite.config.ts`.
export default defineConfig({
  root: fileURLToPath(new URL("web", import.meta.url)),
  // Its OWN dep-optimization cache: sharing node_modules/.vite with the site's
  // dev server makes concurrent optimize passes clobber each other, which breaks
  // client JS on whichever server loses the race.
  cacheDir: fileURLToPath(
    new URL("../node_modules/.vite-editor", import.meta.url),
  ),
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
