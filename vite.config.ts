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
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
