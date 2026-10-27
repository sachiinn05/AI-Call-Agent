import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Builds into frontend/dist, which the Express server (backend/server.ts) serves as static files.
// Dev mode (npm run web:dev) proxies /api and /webhooks to the backend, using the PORT from
// the repo's .env, so the same fetch("/api/...") calls work unchanged.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const backend = `http://localhost:${env.PORT || 3000}`;
  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": backend,
        "/webhooks": backend,
      },
    },
  };
});
