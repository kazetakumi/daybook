import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";
import { createWorkersRoute } from "./workers";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "schema.sql"), "utf-8"));
  return db;
}

// Mirrors the real wiring in src/server/index.ts: session middleware first,
// then auth + workers routes both mounted at /api.
function makeApp(db: Database.Database) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.route("/api", createAuthRoute(db));
  app.route("/api", createWorkersRoute(db));
  return app;
}

function jsonReq(method: string, body: unknown, cookie: string) {
  return {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  };
}

/**
 * The session cookie is Secure (auth.ts), so a plain http:// curl-style
 * round-trip won't carry it back — real verification happens in-process via
 * app.request, exactly like auth.test.ts. This logs in once and returns the
 * Cookie header value to attach to subsequent requests.
 */
async function loggedInCookie(app: Hono, db: Database.Database): Promise<string> {
  const res = await app.request("/api/auth/set-pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "1234" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/daybook_session=[^;]+/);
  if (!match) throw new Error(`no session cookie in Set-Cookie header: ${setCookie}`);
  void db;
  return match[0];
}

describe("GET /api/workers/:id without a session", () => {
  it("401s — proves the shared session middleware gates the new routes too", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/workers/1");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/workers", () => {
  it("creates a worker plus its initial rate_period and cycle_config rows at joined_on", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const res = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Lakshmi", role: "Maid", rate: 250, cycleStartDay: 1 }, cookie),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number };
    expect(body.id).toBeGreaterThan(0);

    const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(body.id) as Record<
      string,
      unknown
    >;
    expect(worker.name).toBe("Lakshmi");
    expect(worker.role).toBe("Maid");
    expect(worker.paid_leaves_per_cycle).toBe(2); // default quota
    expect(worker.archived_on).toBeNull();

    const rate = db
      .prepare("SELECT * FROM rate_periods WHERE worker_id = ?")
      .get(body.id) as Record<string, unknown>;
    expect(rate.rate_rupees).toBe(250);
    expect(rate.effective_from).toBe(worker.joined_on);

    const cycleConfig = db
      .prepare("SELECT * FROM cycle_configs WHERE worker_id = ?")
      .get(body.id) as Record<string, unknown>;
    expect(cycleConfig.start_day).toBe(1);
    expect(cycleConfig.effective_from).toBe(worker.joined_on);
  });

  it("rejects a cycle start day outside 1-28", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const tooLow = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "X", rate: 100, cycleStartDay: 0 }, cookie),
    );
    expect(tooLow.status).toBe(400);

    const tooHigh = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "X", rate: 100, cycleStartDay: 29 }, cookie),
    );
    expect(tooHigh.status).toBe(400);
  });

  it("accepts an explicit quota, overriding the default of 2", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const res = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Ravi", rate: 300, cycleStartDay: 10, quota: 3 }, cookie),
    );
    const body = (await res.json()) as { id: number };
    const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(body.id) as Record<
      string,
      unknown
    >;
    expect(worker.paid_leaves_per_cycle).toBe(3);
  });

  it("shows up on GET /api/home with the running amount for all-Present days so far", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Sunita", rate: 250, cycleStartDay: 1 }, cookie),
    );

    const res = await app.request("/api/home", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workers: Array<Record<string, unknown>> };
    expect(body.workers).toHaveLength(1);
    const card = body.workers[0]!;
    expect(card.name).toBe("Sunita");
    expect(card.avatarInitial).toBe("S");
    expect(card.leavesUsed).toBe(0);
    // Joined today, no marks yet: today is the only day counted, all Present.
    expect(card.amount).toBe(250);
  });
});

describe("PATCH /api/workers/:id", () => {
  it("updates the paid-leave quota", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Ravi", rate: 300, cycleStartDay: 10 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const res = await app.request(`/api/workers/${id}`, jsonReq("PATCH", { quota: 4 }, cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paidLeavesPerCycle: number };
    expect(body.paidLeavesPerCycle).toBe(4);
  });

  it("archiving hides the worker from /api/home without deleting the row", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Meena", rate: 200, cycleStartDay: 5 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const beforeArchive = await app.request("/api/home", { headers: { cookie } });
    expect(((await beforeArchive.json()) as { workers: unknown[] }).workers).toHaveLength(1);

    const patchRes = await app.request(`/api/workers/${id}`, jsonReq("PATCH", { archive: true }, cookie));
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { archivedOn: string | null };
    expect(patched.archivedOn).not.toBeNull();

    const afterArchive = await app.request("/api/home", { headers: { cookie } });
    expect(((await afterArchive.json()) as { workers: unknown[] }).workers).toHaveLength(0);

    // No hard delete anywhere (SPEC.md §1.10): the row still exists.
    const row = db.prepare("SELECT * FROM workers WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    expect(row).toBeDefined();
    expect(row!.archived_on).toBe(patched.archivedOn);
  });
});

describe("POST /api/workers/:id/rate", () => {
  it("splits the current cycle's computed amount across old and new rates from the effective-from date", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    // Seed a worker backdated well before "today" so the current cycle
    // window has enough history for a mid-cycle rate split to be visible —
    // POST /api/workers alone can't exercise this (joined_on is always
    // today, so the current window only ever has one day so far).
    db.prepare(
      "INSERT INTO workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (100, 'Backdated', '2020-01-01', 2)",
    ).run();
    db.prepare(
      "INSERT INTO rate_periods (worker_id, rate_rupees, effective_from) VALUES (100, 200, '2020-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO cycle_configs (worker_id, start_day, effective_from) VALUES (100, 1, '2020-01-01')",
    ).run();

    const res = await app.request(
      "/api/workers/100/rate",
      jsonReq("POST", { rate: 300, effectiveFrom: "2020-01-15" }, cookie),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { effectiveFrom: string };
    expect(body.effectiveFrom).toBe("2020-01-15");

    // /cycles pages back PAST_PAGE_SIZE windows at a time, most-recent-first
    // — the January 2020 window is many pages back from "today" (whenever
    // the test happens to run), so walk the `nextBefore` cursor until it
    // turns up, rather than assuming it's on the first page.
    type CyclesPage = {
      past: Array<{ window: { start: string; end: string }; settlement: { segments: unknown[] } }>;
      nextBefore: string | null;
    };
    let before: string | undefined;
    let januaryWindow: CyclesPage["past"][number] | undefined;
    for (let i = 0; i < 100 && !januaryWindow; i++) {
      const query = before ? `?before=${before}` : "";
      const cyclesRes = await app.request(`/api/workers/100/cycles${query}`, { headers: { cookie } });
      const cyclesBody = (await cyclesRes.json()) as CyclesPage;
      januaryWindow = cyclesBody.past.find((p) => p.window.start === "2020-01-01");
      if (!cyclesBody.nextBefore) break;
      before = cyclesBody.nextBefore;
    }

    expect(januaryWindow).toBeDefined();
    // Two segments: days 1-14 at ₹200, days 15-31 at ₹300.
    expect(januaryWindow!.settlement.segments).toHaveLength(2);
  });

  it("rejects a non-positive rate", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "X", rate: 100, cycleStartDay: 1 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const res = await app.request(`/api/workers/${id}/rate`, jsonReq("POST", { rate: 0 }, cookie));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/workers/:id/cycle-config", () => {
  it("defers effective_from to the day after the CURRENT window ends, not today", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    db.prepare(
      "INSERT INTO workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (200, 'Cyclic', '2020-01-01', 2)",
    ).run();
    db.prepare(
      "INSERT INTO rate_periods (worker_id, rate_rupees, effective_from) VALUES (200, 200, '2020-01-01')",
    ).run();
    db.prepare(
      "INSERT INTO cycle_configs (worker_id, start_day, effective_from) VALUES (200, 1, '2020-01-01')",
    ).run();

    const detailBefore = await app.request("/api/workers/200", { headers: { cookie } });
    const todayIso = new Date().toISOString().slice(0, 10);
    void detailBefore;

    const cyclesRes = await app.request("/api/workers/200/cycles", { headers: { cookie } });
    const cyclesBody = (await cyclesRes.json()) as { current: { window: { start: string; end: string } } };
    const currentWindowEnd = cyclesBody.current.window.end;
    expect(currentWindowEnd >= todayIso).toBe(true); // sanity: it really is the open window

    const res = await app.request(
      "/api/workers/200/cycle-config",
      jsonReq("POST", { startDay: 15 }, cookie),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { effectiveFrom: string };

    const expectedNextDay = (() => {
      const [y, m, d] = currentWindowEnd.split("-").map(Number);
      const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    })();

    expect(body.effectiveFrom).toBe(expectedNextDay);
    // The critical assertion this test exists for: NOT simply today.
    expect(body.effectiveFrom).not.toBe(todayIso);
  });

  it("rejects a start day outside 1-28", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "X", rate: 100, cycleStartDay: 1 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const res = await app.request(
      `/api/workers/${id}/cycle-config`,
      jsonReq("POST", { startDay: 40 }, cookie),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/workers/:id/cycles", () => {
  it("404s for a worker that doesn't exist", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app, db);

    const res = await app.request("/api/workers/999/cycles", { headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
