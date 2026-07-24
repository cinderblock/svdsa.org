/**
 * Wire Monaco to run fully bundled (no CDN loader) under Vite.
 *
 * monaco@0.56 restructured its per-language files, so we import the barrel
 * (includes markdown) rather than hand-picking language modules. Worker paths
 * go through monaco's `exports` map (`./*.js` → `./esm/vs/*.js`), hence
 * `monaco-editor/editor/editor.worker.js`, not the raw esm path.
 * `loader.config({ monaco })` points @monaco-editor/react at this local
 * instance instead of fetching from jsdelivr.
 *
 * TODO(perf): trim the bundle to markdown-only once 0.56's language layout
 * settles — it's a large chunk, acceptable for now behind Access.
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
