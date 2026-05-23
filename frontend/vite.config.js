import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development, Vite proxies API routes to the backend so HttpOnly cookies
// work correctly (same-origin from the browser's perspective).
// In production, @fastify/static serves the built frontend from the same origin
// as the API, so no proxy is needed.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL || "http://localhost:3000";

  return {
    plugins: [react()],

    server: {
      port: 5173,
      proxy: {
        "/auth": { target: backendUrl, changeOrigin: true },
        "/files": { target: backendUrl, changeOrigin: true },
        "/accounts": { target: backendUrl, changeOrigin: true },
      },
    },

    build: {
      // Output goes into the backend's public/ folder so Fastify can serve it.
      // Run `npm run build` from the frontend/ directory before starting the backend.
      outDir: "../public",
      emptyOutDir: true,
    },
  };
});
