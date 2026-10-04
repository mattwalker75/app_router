import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "node:fs";

// In dev (`./ROUTER.sh --dev`) Vite serves the page with live reload and forwards
// /api and /icons to the server on the port in config.json.
function serverPort(): number {
  try {
    const file = process.env.AR_CONFIG || "config.json";
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).server?.port || 80;
  } catch {}
  return 80;
}
const target = `http://127.0.0.1:${serverPort()}`;

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5174,
    proxy: { "/api": { target, changeOrigin: false }, "/icons": { target, changeOrigin: false } },
  },
});
