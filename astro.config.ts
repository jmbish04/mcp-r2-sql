// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const site = process.env.SITE ?? "http://localhost:4321";
const base = process.env.BASE || "/";

// @astrojs/cloudflare v13 is built on @cloudflare/vite-plugin: the plugin
// reads wrangler.jsonc (whose `main` points at src/worker.ts) and builds the
// Worker as part of `astro build`. The v12-era options (platformProxy,
// routes, workerEntryPoint) no longer exist — the custom entry lives in
// src/worker.ts and wrangler.jsonc instead.
export default defineConfig({
  site,
  srcDir: "./src/frontend",
  base,
  output: "server",
  adapter: cloudflare({
    imageService: "cloudflare",
    // Use the project's existing `SESSIONS` KV binding for Astro sessions
    // (the adapter default expects a binding named `SESSION`).
    sessionKVBindingName: "SESSIONS",
  }),
  integrations: [react()],
  vite: {
    // Lower TC39 decorators (`@callable()` in the Agents SDK Durable
    // Objects) — workerd's V8 does not parse native decorator syntax, and
    // the default esnext target passes them through untransformed.
    esbuild: { target: "es2022" },
    plugins: [
      // Cast through the Vite plugin type to work around the current
      // Vite/@tailwindcss-vite HotUpdateOptions mismatch without dropping
      // type information entirely.
      tailwindcss() as unknown as import("vite").Plugin,
    ],
    // Explicitly externalize node built-in modules for SSR.
    ssr: {
      external: [
        "node:fs/promises",
        "node:path",
        "node:url",
        "node:crypto",
        "node:buffer",
        "node:stream",
        "node:util",
      ],
    },
  },
});
