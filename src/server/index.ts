import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getDb } from "./db";
import { healthRoute } from "./routes/health";

// Creates data/daybook.sqlite (and its six tables from schema.sql) on first
// run, before the server starts accepting requests.
getDb();

const app = new Hono();

app.route("/api/health", healthRoute);

// Later tickets each own one route file and mount it here, one line apiece
// — they should never need to touch this file's neighbours:
// app.route("/api/auth", authRoute);          // ticket 03 — src/server/routes/auth.ts
// app.route("/api/workers", workersRoute);     // ticket 04/05 — src/server/routes/workers.ts
// app.route("/api/marks", marksRoute);         // ticket 05 — src/server/routes/marks.ts
// app.route("/api/payments", paymentsRoute);   // ticket 06 — src/server/routes/payments.ts
// app.route("/api/backup", backupRoute);       // ticket 08 — src/server/routes/backup.ts

// Serve the built client from the same port once it exists (i.e. after
// `npm run build`). In dev, Vite serves the client on its own port and
// proxies /api/* here instead, so `dist/` is absent and this is skipped.
const distDir = join(process.cwd(), "dist");
if (existsSync(distDir)) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  const origin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${info.port}`;
  console.log(`Daybook server listening on ${origin} (port ${info.port})`);
});

export default app;
