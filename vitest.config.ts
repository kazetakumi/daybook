import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Only TEST_DATABASE_URL is lifted out of .env — never DATABASE_URL, so no
// test can ever reach the real (Supabase) database. Set on process.env (not
// test.env) so globalSetup, which runs in this process, sees it too.
const { TEST_DATABASE_URL } = loadEnv("test", process.cwd(), "TEST_");
if (TEST_DATABASE_URL) process.env.TEST_DATABASE_URL ??= TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/server/testing/globalSetup.ts"],
  },
});
