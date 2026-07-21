import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    // Match the tsconfig `~/*` -> `app/*` path alias for Vite (dev + build).
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 9999,
    strictPort: true,
    allowedHosts: ["noook", "noook.tsl"],
  },
});
