import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "schema.sql"), "utf-8"));
  return db;
}

// Mirrors the real wiring in src/server/index.ts: session middleware first,
// then the auth routes mounted at /api.
function makeApp(db: Database.Database) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.route("/api", createAuthRoute(db));
  return app;
}

function jsonPost(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/daybook_session=[^;]+/);
  if (!match) throw new Error(`no session cookie in Set-Cookie header: ${setCookie}`);
  return match[0];
}

describe("GET /api/auth/status", () => {
  it("reports pinSet: false on a fresh database", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/auth/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pinSet: false });
  });

  it("reports pinSet: true once a PIN has been set", async () => {
    const db = makeDb();
    const app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "1234" }));
    const res = await app.request("/api/auth/status");
    expect(await res.json()).toEqual({ pinSet: true });
  });
});

describe("POST /api/auth/set-pin", () => {
  it("hashes the PIN into settings.pin_hash — never plaintext — and logs in", async () => {
    const db = makeDb();
    const app = makeApp(db);

    const res = await app.request("/api/auth/set-pin", jsonPost({ pin: "1234" }));
    expect(res.status).toBe(200);

    const row = db.prepare("SELECT value FROM settings WHERE key = 'pin_hash'").get() as
      | { value: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.value).not.toContain("1234");
    expect(row!.value).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/daybook_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=15552000/); // 180 days in seconds
  });

  it("rejects a PIN outside 4-6 digits", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/auth/set-pin", jsonPost({ pin: "12" }));
    expect(res.status).toBe(400);
  });

  it("refuses to overwrite an existing PIN (no auth required to hit this route)", async () => {
    const db = makeDb();
    const app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "1234" }));
    const res = await app.request("/api/auth/set-pin", jsonPost({ pin: "5678" }));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/login", () => {
  it("issues a session cookie on the correct PIN", async () => {
    const db = makeDb();
    const app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "4321" }));

    const res = await app.request("/api/login", jsonPost({ pin: "4321" }));
    expect(res.status).toBe(200);
    expect(extractCookie(res)).toMatch(/daybook_session=/);
  });

  it("rejects the wrong PIN with 401 and no cookie", async () => {
    const db = makeDb();
    const app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "4321" }));

    const res = await app.request("/api/login", jsonPost({ pin: "0000" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects login before any PIN has been set", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/login", jsonPost({ pin: "1234" }));
    expect(res.status).toBe(401);
  });

  it("a session survives a simulated process restart (secret persisted in settings, not memory)", async () => {
    const db = makeDb();
    let app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "9999" }));
    const loginRes = await app.request("/api/login", jsonPost({ pin: "9999" }));
    const cookie = extractCookie(loginRes);

    // Fresh app/middleware/route instances over the same (persisted) db —
    // stands in for the server process restarting.
    app = makeApp(db);
    const res = await app.request("/api/auth/session", { headers: { cookie } });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/session", () => {
  it("401s without a session and 200s with one", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const loggedOut = await app.request("/api/auth/session");
    expect(loggedOut.status).toBe(401);

    const setupRes = await app.request("/api/auth/set-pin", jsonPost({ pin: "1234" }));
    const cookie = extractCookie(setupRes);
    const loggedIn = await app.request("/api/auth/session", { headers: { cookie } });
    expect(loggedIn.status).toBe(200);
  });
});

describe("POST /api/auth/change-pin", () => {
  it("requires a valid session — 401 with no cookie", async () => {
    const db = makeDb();
    const app = makeApp(db);
    await app.request("/api/auth/set-pin", jsonPost({ pin: "1111" }));

    const res = await app.request(
      "/api/auth/change-pin",
      jsonPost({ currentPin: "1111", newPin: "2222" }),
    );
    expect(res.status).toBe(401);
  });

  it("requires the correct current PIN even with a valid session — 403, not 401", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const setupRes = await app.request("/api/auth/set-pin", jsonPost({ pin: "1111" }));
    const cookie = extractCookie(setupRes);

    const res = await app.request("/api/auth/change-pin", {
      ...jsonPost({ currentPin: "0000", newPin: "2222" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(res.status).toBe(403);
  });

  it("changes the PIN: old PIN stops working, new PIN logs in", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const setupRes = await app.request("/api/auth/set-pin", jsonPost({ pin: "1111" }));
    const cookie = extractCookie(setupRes);

    const changeRes = await app.request("/api/auth/change-pin", {
      ...jsonPost({ currentPin: "1111", newPin: "2222" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(changeRes.status).toBe(200);

    const loginOld = await app.request("/api/login", jsonPost({ pin: "1111" }));
    expect(loginOld.status).toBe(401);

    const loginNew = await app.request("/api/login", jsonPost({ pin: "2222" }));
    expect(loginNew.status).toBe(200);
  });
});
