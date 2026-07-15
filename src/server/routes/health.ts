import { Hono } from "hono";

// GET /api/health — the only route ticket 01 gives real logic. Mounted at
// /api/health in src/server/index.ts.
export const healthRoute = new Hono().get("/", (c) => c.json({ ok: true }));
