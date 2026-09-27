import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Sql } from "../db";
import { createSessionToken, getSessionSecret } from "../lib/auth";
import { makeTestDb as makeDb } from "../testing/testDb";
import { createSessionMiddleware } from "./session";

// A stand-in for the real app (src/server/index.ts): the middleware mounted
// on /api/*, plus a couple of routes that don't exist yet in the real app
// (04-08's territory) to prove the gate applies to *any* future /api/*
// route without needing changes here.
function makeApp(db: Sql) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.get("/api/login", (c) => c.json({ ok: true }));
  app.get("/api/auth/status", (c) => c.json({ ok: true }));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/workers", (c) => c.json({ ok: true })); // hypothetical ticket 04 route
  app.post("/api/marks/1/2026-07-15", (c) => c.json({ ok: true })); // hypothetical ticket 05 route
  return app;
}

describe("session middleware", () => {
  it("rejects a protected route with no cookie at all", async () => {
    const app = makeApp(await makeDb());
    const res = await app.request("/api/workers");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a protected route with a garbage cookie", async () => {
    const app = makeApp(await makeDb());
    const res = await app.request("/api/workers", {
      headers: { cookie: "daybook_session=not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a protected POST route with no cookie", async () => {
    const app = makeApp(await makeDb());
    const res = await app.request("/api/marks/1/2026-07-15", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("allows protected routes through with a valid session cookie", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const token = createSessionToken(await getSessionSecret(db));

    const getRes = await app.request("/api/workers", {
      headers: { cookie: `daybook_session=${token}` },
    });
    expect(getRes.status).toBe(200);

    const postRes = await app.request("/api/marks/1/2026-07-15", {
      method: "POST",
      headers: { cookie: `daybook_session=${token}` },
    });
    expect(postRes.status).toBe(200);
  });

  it("rejects an expired session cookie", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const expiredToken = createSessionToken(await getSessionSecret(db), -1000);

    const res = await app.request("/api/workers", {
      headers: { cookie: `daybook_session=${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });

  it("exempts /api/login, /api/auth/status and /api/health without any cookie", async () => {
    const app = makeApp(await makeDb());
    for (const path of ["/api/login", "/api/auth/status", "/api/health"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
    }
  });
});
