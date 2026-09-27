import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Sql } from "../db";
import { makeTestDb as makeDb } from "../testing/testDb";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";
import { createWorkersRoute } from "./workers";
import { createPaymentsRoute } from "./payments";

// Mirrors the real wiring in src/server/index.ts.
function makeApp(db: Sql) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.route("/api", createAuthRoute(db));
  app.route("/api", createWorkersRoute(db));
  app.route("/api/payments", createPaymentsRoute(db));
  return app;
}

function jsonReq(method: string, body: unknown, cookie: string) {
  return {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  };
}

async function loggedInCookie(app: Hono): Promise<string> {
  const res = await app.request("/api/auth/set-pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "1234" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/daybook_session=[^;]+/);
  if (!match) throw new Error(`no session cookie in Set-Cookie header: ${setCookie}`);
  return match[0];
}

/** A Worker backdated well before "today" with one fully-closed cycle (Jan 2020, day 1-31 at ₹200/day, no marks). */
async function seedBackdatedWorker(db: Sql, id: number): Promise<void> {
  await db`INSERT INTO daybook_workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (${id}, 'Backdated', '2020-01-01', 2)`;
  await db`INSERT INTO daybook_rate_periods (worker_id, rate_rupees, effective_from) VALUES (${id}, 200, '2020-01-01')`;
  await db`INSERT INTO daybook_cycle_configs (worker_id, start_day, effective_from) VALUES (${id}, 1, '2020-01-01')`;
}

describe("POST /api/payments without a session", () => {
  it("401s — proves the shared session middleware gates this route too", async () => {
    const app = makeApp(await makeDb());
    const res = await app.request("/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId: 1, periodStart: "2020-01-01", periodEnd: "2020-01-31" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/payments", () => {
  it("inserts a Payment snapshot with the server-recomputed total, not a client-supplied amount", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    await seedBackdatedWorker(db, 100);

    // 31 Present days at ₹200 = ₹6,200. Send a bogus client-side amount to
    // prove the server ignores it and recomputes its own (SPEC.md §1.9 / ADR-0001).
    const res = await app.request(
      "/api/payments",
      jsonReq(
        "POST",
        { workerId: 100, periodStart: "2020-01-01", periodEnd: "2020-01-31", amount: 999999 },
        cookie,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amount: number; periodStart: string; periodEnd: string; paidOn: string };
    expect(body.amount).toBe(6200);
    expect(body.periodStart).toBe("2020-01-01");
    expect(body.periodEnd).toBe("2020-01-31");

    const row = (await db`SELECT * FROM daybook_payments WHERE worker_id = 100`)[0] as Record<string, unknown>;
    expect(row.amount_rupees).toBe(6200);
    expect(row.paid_on).toBe(body.paidOn);
  });

  it("is idempotent — a second call for the same window returns the existing snapshot, no duplicate row", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    await seedBackdatedWorker(db, 101);

    const first = await app.request(
      "/api/payments",
      jsonReq("POST", { workerId: 101, periodStart: "2020-01-01", periodEnd: "2020-01-31" }, cookie),
    );
    expect(first.status).toBe(200);

    // Change the day after — a Payment snapshot must never reflect this,
    // and re-posting must not create a second row or move the amount.
    await db`INSERT INTO daybook_marks (worker_id, date, state) VALUES (101, '2020-01-10', 'off')`;

    const second = await app.request(
      "/api/payments",
      jsonReq("POST", { workerId: 101, periodStart: "2020-01-01", periodEnd: "2020-01-31" }, cookie),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { amount: number };
    expect(secondBody.amount).toBe(6200); // unchanged snapshot, not the new (drifted) total

    const rows = (await db`SELECT * FROM daybook_payments WHERE worker_id = 101`);
    expect(rows).toHaveLength(1);
  });

  it("rejects a window that hasn't closed yet", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    await seedBackdatedWorker(db, 102);

    const cyclesRes = await app.request("/api/workers/102/cycles", { headers: { cookie } });
    const cyclesBody = (await cyclesRes.json()) as { current: { window: { start: string; end: string } } };

    const res = await app.request(
      "/api/payments",
      jsonReq(
        "POST",
        { workerId: 102, periodStart: cyclesBody.current.window.start, periodEnd: cyclesBody.current.window.end },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("404s for a worker that doesn't exist", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const res = await app.request(
      "/api/payments",
      jsonReq("POST", { workerId: 999, periodStart: "2020-01-01", periodEnd: "2020-01-31" }, cookie),
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed date range", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    await seedBackdatedWorker(db, 103);

    const res = await app.request(
      "/api/payments",
      jsonReq("POST", { workerId: 103, periodStart: "2020-01-31", periodEnd: "2020-01-01" }, cookie),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/payments/:workerId", () => {
  it("404s for a worker that doesn't exist", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const res = await app.request("/api/payments/999", { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("lists Payments oldest window first, and reflects Drift (computed vs. stored) when a day is edited after payday", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    await seedBackdatedWorker(db, 104);

    await app.request(
      "/api/payments",
      jsonReq("POST", { workerId: 104, periodStart: "2020-01-01", periodEnd: "2020-01-31" }, cookie),
    );

    const listRes = await app.request("/api/payments/104", { headers: { cookie } });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      payments: Array<{ periodStart: string; periodEnd: string; amount: number }>;
    };
    expect(listBody.payments).toHaveLength(1);
    expect(listBody.payments[0]!.amount).toBe(6200);

    // Simulate ticket 05's marks route (not landed yet as of this ticket) by
    // writing the mark row directly — same effect a PUT /api/marks would
    // have. An Off day pays half-rate, so the live total must now be lower
    // than the frozen Payment, i.e. the Settle pane's Drift banner condition.
    await db`INSERT INTO daybook_marks (worker_id, date, state) VALUES (104, '2020-01-15', 'off')`;

    const cyclesRes = await app.request("/api/workers/104/cycles?before=2020-02-01", { headers: { cookie } });
    const cyclesBody = (await cyclesRes.json()) as {
      past: Array<{ window: { start: string; end: string }; settlement: { total: number } }>;
    };
    const januaryWindow = cyclesBody.past.find((p) => p.window.start === "2020-01-01");
    expect(januaryWindow).toBeDefined();
    // 30 Present + 1 Off at ₹200/day = 6000 + 100 = 6100, strictly less than
    // the frozen Payment of 6200 — computed !== paid, i.e. Drift.
    expect(januaryWindow!.settlement.total).toBe(6100);
    expect(januaryWindow!.settlement.total).not.toBe(listBody.payments[0]!.amount);

    // Revert the edit: drift must disappear (computed total matches the
    // Payment again), per ADR-0001 — nothing is silently reconciled, but
    // nothing should stay drifted once the underlying edit is undone either.
    await db`DELETE FROM daybook_marks WHERE worker_id = 104 AND date = '2020-01-15'`;
    const revertedRes = await app.request("/api/workers/104/cycles?before=2020-02-01", { headers: { cookie } });
    const revertedBody = (await revertedRes.json()) as {
      past: Array<{ window: { start: string; end: string }; settlement: { total: number } }>;
    };
    const revertedWindow = revertedBody.past.find((p) => p.window.start === "2020-01-01");
    expect(revertedWindow!.settlement.total).toBe(6200);
    expect(revertedWindow!.settlement.total).toBe(listBody.payments[0]!.amount);
  });
});
