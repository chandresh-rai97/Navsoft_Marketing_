import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Writes dist/sw.js at build time: a new version (and precache list of this
// build's own files) on every deploy, so phones pick up updates on next open.
function serviceWorker() {
  return {
    name: "cadence-service-worker",
    apply: "build",
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => /\.(js|css|woff2?|png|svg|ico|webmanifest)$/.test(f));
      const extra = ["/offline.html", "/manifest.webmanifest", "/favicon.png", "/brand/navai-lockup-light.png",
        "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"];
      const version = Date.now().toString(36);
      const src = readFileSync(new URL("./src/sw-template.js", import.meta.url), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify([...new Set([...files.map((f) => "/" + f), ...extra])]));
      this.emitFile({ type: "asset", fileName: "sw.js", source: src });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
