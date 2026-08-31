import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API server (src/server) listens on this port in both dev and prod;
// only the client dev-server port differs (Vite's own default, 5173).
const apiPort = process.env.PORT ?? 3000;

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    // Bind IPv4 explicitly: Vite's default "localhost" resolves to ::1 only
    // on Windows, which Chrome (resolving localhost to 127.0.0.1) can't reach.
    host: "127.0.0.1",
    proxy: {
      // Regex, not a prefix: a bare "/api" key also swallows the client's own
      // /api.ts module request and proxies it to the server, which answers
      // with SPA-fallback HTML and breaks the module load.
      "^/api/": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
