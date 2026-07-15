import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";
import { createWorkersRoute } from "./workers";
import { createMarksRoute } from "./marks";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "schema.sql"), "utf-8"));
  return db;
}

// Mirrors the real wiring in src/server/index.ts.
function makeApp(db: Database.Database) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.route("/api", createAuthRoute(db));
  app.route("/api", createWorkersRoute(db));
  app.route("/api/marks", createMarksRoute(db));
  return app;
}

function jsonReq(method: string, body: unknown, cookie: string) {
  return {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  };
}

/** Same technique as workers.test.ts: the session cookie is Secure, so it
 * only round-trips through in-process app.request, not a bare fetch/curl. */
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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Seeds a worker backdated well before "today" so past-window / quota-reflow
 * scenarios have enough history to exercise (POST /api/workers alone can't —
 * joined_on is always today). */
function seedBackdatedWorker(
  db: Database.Database,
  id: number,
  opts: { rate?: number; quota?: number; joinedOn?: string; cycleStartDay?: number } = {},
) {
  const { rate = 200, quota = 2, joinedOn = "2020-01-01", cycleStartDay = 1 } = opts;
  db.prepare(
    "INSERT INTO workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (?, 'Test', ?, ?)",
  ).run(id, joinedOn, quota);
  db.prepare("INSERT INTO rate_periods (worker_id, rate_rupees, effective_from) VALUES (?, ?, ?)").run(
    id,
    rate,
    joinedOn,
  );
  db.prepare("INSERT INTO cycle_configs (worker_id, start_day, effective_from) VALUES (?, ?, ?)").run(
    id,
    cycleStartDay,
    joinedOn,
  );
}

describe("PUT /api/marks/:workerId/:date without a session", () => {
  it("401s — proves the shared session middleware gates marks routes too", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/marks/1/2020-01-01", jsonReq("PUT", { state: "leave" }, ""));
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/marks/:workerId/:date", () => {
  it("404s for a worker that doesn't exist", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    const res = await app.request("/api/marks/999/2020-01-01", jsonReq("PUT", { state: "leave" }, cookie));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid state", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1);
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    const res = await app.request("/api/marks/1/2020-01-05", jsonReq("PUT", { state: "sick" }, cookie));
    expect(res.status).toBe(400);
  });

  it("rejects a date after today", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1);
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const future = addDaysISO(todayISO(), 3);
    const res = await app.request(
      `/api/marks/1/${future}`,
      jsonReq("PUT", { state: "leave" }, cookie),
    );
    expect(res.status).toBe(400);

    const row = db.prepare("SELECT * FROM marks WHERE worker_id = 1 AND date = ?").get(future);
    expect(row).toBeUndefined();
  });

  it("rejects a date before the worker joined", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1, { joinedOn: "2020-06-01" });
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const res = await app.request(
      "/api/marks/1/2020-05-15",
      jsonReq("PUT", { state: "leave" }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it("upserts a leave row, then a PUT of 'present' deletes it (exceptions-only storage)", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1);
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const put1 = await app.request(
      "/api/marks/1/2020-01-05",
      jsonReq("PUT", { state: "leave" }, cookie),
    );
    expect(put1.status).toBe(200);
    const row1 = db.prepare("SELECT * FROM marks WHERE worker_id = 1 AND date = '2020-01-05'").get() as
      | { state: string }
      | undefined;
    expect(row1?.state).toBe("leave");

    // Re-marking with a different state (off) upserts in place, not a duplicate row.
    const put2 = await app.request("/api/marks/1/2020-01-05", jsonReq("PUT", { state: "off" }, cookie));
    expect(put2.status).toBe(200);
    const row2 = db.prepare("SELECT * FROM marks WHERE worker_id = 1 AND date = '2020-01-05'").get() as
      | { state: string }
      | undefined;
    expect(row2?.state).toBe("off");
    const countAfterUpsert = (
      db.prepare("SELECT COUNT(*) as n FROM marks WHERE worker_id = 1 AND date = '2020-01-05'").get() as {
        n: number;
      }
    ).n;
    expect(countAfterUpsert).toBe(1);

    // Marking back to 'present' removes the row entirely (this is the
    // acceptance item: "verify no marks rows for Present days" via direct
    // SQLite query).
    const put3 = await app.request(
      "/api/marks/1/2020-01-05",
      jsonReq("PUT", { state: "present" }, cookie),
    );
    expect(put3.status).toBe(200);
    const row3 = db.prepare("SELECT * FROM marks WHERE worker_id = 1 AND date = '2020-01-05'").get();
    expect(row3).toBeUndefined();
  });

  it("succeeds for a date in a past cycle window (past days stay editable)", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1);
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    // 2020-01-01 is many cycles before "today" for any run of this suite.
    const res = await app.request(
      "/api/marks/1/2020-01-10",
      jsonReq("PUT", { state: "leave" }, cookie),
    );
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT * FROM marks WHERE worker_id = 1 AND date = '2020-01-10'").get() as
      | { state: string }
      | undefined;
    expect(row?.state).toBe("leave");
  });
});

describe("GET /api/marks/:workerId", () => {
  it("404s for a worker that doesn't exist", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);
    const res = await app.request("/api/marks/999", { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("returns marks within a from/to window, excluding marks outside it", async () => {
    const db = makeDb();
    seedBackdatedWorker(db, 1);
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    await app.request("/api/marks/1/2020-01-05", jsonReq("PUT", { state: "leave" }, cookie));
    await app.request("/api/marks/1/2020-01-20", jsonReq("PUT", { state: "off" }, cookie));
    await app.request("/api/marks/1/2020-02-05", jsonReq("PUT", { state: "leave" }, cookie));

    const res = await app.request("/api/marks/1?from=2020-01-01&to=2020-01-31", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { marks: Array<{ date: string; state: string }> };
    expect(body.marks).toHaveLength(2);
    expect(body.marks.map((m) => m.date)).toEqual(["2020-01-05", "2020-01-20"]);
  });
});

describe("home cards reflect a mark live", () => {
  it("PUT-ing a leave for today changes GET /api/home's amount and leavesUsed without any other change", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Priya", rate: 250, cycleStartDay: 1 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const before = await app.request("/api/home", { headers: { cookie } });
    const beforeBody = (await before.json()) as { workers: Array<{ id: number; amount: number; leavesUsed: number }> };
    const cardBefore = beforeBody.workers.find((w) => w.id === id)!;
    expect(cardBefore.amount).toBe(250); // joined today, one Present day so far
    expect(cardBefore.leavesUsed).toBe(0);

    const markRes = await app.request(
      `/api/marks/${id}/${todayISO()}`,
      jsonReq("PUT", { state: "leave" }, cookie),
    );
    expect(markRes.status).toBe(200);

    const after = await app.request("/api/home", { headers: { cookie } });
    const afterBody = (await after.json()) as { workers: Array<{ id: number; amount: number; leavesUsed: number }> };
    const cardAfter = afterBody.workers.find((w) => w.id === id)!;
    expect(cardAfter.leavesUsed).toBe(1);
    expect(cardAfter.amount).toBe(250); // today's only Leave is Paid (quota 2), so amount unchanged
  });

  it("PUT-ing 'off' for today halves that card's amount on GET /api/home", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    const created = await app.request(
      "/api/workers",
      jsonReq("POST", { name: "Rekha", rate: 250, cycleStartDay: 1 }, cookie),
    );
    const { id } = (await created.json()) as { id: number };

    const before = await app.request("/api/home", { headers: { cookie } });
    const beforeBody = (await before.json()) as { workers: Array<{ id: number; amount: number }> };
    expect(beforeBody.workers.find((w) => w.id === id)!.amount).toBe(250);

    const markRes = await app.request(
      `/api/marks/${id}/${todayISO()}`,
      jsonReq("PUT", { state: "off" }, cookie),
    );
    expect(markRes.status).toBe(200);

    const after = await app.request("/api/home", { headers: { cookie } });
    const afterBody = (await after.json()) as { workers: Array<{ id: number; amount: number }> };
    // Off pays half-rate (SPEC.md §1.3): 250 -> 125, live off the same
    // recompute-from-GET-/api/home path leavesUsed exercised above.
    expect(afterBody.workers.find((w) => w.id === id)!.amount).toBe(125);
  });
});

describe("quota reflow (SPEC.md §3 fixture 4, exercised through the marks route)", () => {
  it("back-dating an earlier Leave flips a later one from paid to unpaid", async () => {
    const db = makeDb();
    // quota 2, backdated far enough that Jun 2020 stays inside one cycle window.
    seedBackdatedWorker(db, 1, { quota: 2, joinedOn: "2020-06-01", cycleStartDay: 1 });
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    await app.request("/api/marks/1/2020-06-18", jsonReq("PUT", { state: "leave" }, cookie));
    await app.request("/api/marks/1/2020-06-25", jsonReq("PUT", { state: "leave" }, cookie));

    type CyclesPage = {
      past: Array<{
        window: { start: string; end: string };
        settlement: { counts: { paidLeave: number; unpaidLeave: number } };
      }>;
      nextBefore: string | null;
    };

    async function findJuneWindow(): Promise<CyclesPage["past"][number]> {
      let before: string | undefined;
      for (let i = 0; i < 200; i++) {
        const query = before ? `?before=${before}` : "";
        const res = await app.request(`/api/workers/1/cycles${query}`, { headers: { cookie } });
        const body = (await res.json()) as CyclesPage;
        const found = body.past.find((p) => p.window.start === "2020-06-01");
        if (found) return found;
        if (!body.nextBefore) throw new Error("June 2020 window not found");
        before = body.nextBefore;
      }
      throw new Error("June 2020 window not found (exhausted pages)");
    }

    const beforeBackdate = await findJuneWindow();
    expect(beforeBackdate.settlement.counts.paidLeave).toBe(2); // 18th and 25th both paid
    expect(beforeBackdate.settlement.counts.unpaidLeave).toBe(0);

    // Adding an earlier Leave on the 3rd bumps the 25th out of the paid quota.
    await app.request("/api/marks/1/2020-06-03", jsonReq("PUT", { state: "leave" }, cookie));

    const afterBackdate = await findJuneWindow();
    expect(afterBackdate.settlement.counts.paidLeave).toBe(2); // 3rd + 18th
    expect(afterBackdate.settlement.counts.unpaidLeave).toBe(1); // 25th flipped
  });
});
