import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Sql } from "../db";
import { makeTestDb as makeDb } from "../testing/testDb";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";
import { createWorkersRoute } from "./workers";
import { BACKUP_SCHEMA_VERSION, createBackupRoute } from "./backup";

// Mirrors the real wiring in src/server/index.ts.
function makeApp(db: Sql) {
  const app = new Hono();
  app.use("/api/*", createSessionMiddleware(db));
  app.route("/api", createAuthRoute(db));
  app.route("/api", createWorkersRoute(db));
  app.route("/api/backup", createBackupRoute(db));
  return app;
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

interface BackupBody {
  exportedAt: string;
  schemaVersion: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}

const EXPECTED_TABLES = ["workers", "rate_periods", "cycle_configs", "marks", "payments"];

describe("GET /api/backup without a session", () => {
  it("401s — proves the shared session middleware gates this route too", async () => {
    const app = makeApp(await makeDb());
    const res = await app.request("/api/backup");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/backup", () => {
  it("downloads a dated JSON export of every data table, with dates as plain ISO strings", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    await db`INSERT INTO daybook_workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (1, 'Seeded Worker', '2020-01-01', 2)`;
    await db`INSERT INTO daybook_marks (worker_id, date, state) VALUES (1, '2020-01-05', 'off')`;

    const res = await app.request("/api/backup", { headers: { cookie } });
    expect(res.status).toBe(200);

    const today = new Date();
    const expectedName = `daybook-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}.json`;
    expect(res.headers.get("content-disposition")).toContain(`filename="${expectedName}"`);

    const body = (await res.json()) as BackupBody;
    expect(body.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(Object.keys(body.tables).sort()).toEqual([...EXPECTED_TABLES].sort());
    expect(body.tables.workers).toEqual([
      { id: 1, name: "Seeded Worker", role: null, joined_on: "2020-01-01", archived_on: null, paid_leaves_per_cycle: 2 },
    ]);
    expect(body.tables.marks).toEqual([{ worker_id: 1, date: "2020-01-05", state: "off" }]);
  });

  it("never includes the PIN hash or the session-signing key", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app); // sets pin_hash; the middleware creates session_secret

    const res = await app.request("/api/backup", { headers: { cookie } });
    const text = await res.text();
    const [pinHash] = await db<{ value: string }[]>`SELECT value FROM daybook_settings WHERE key = 'pin_hash'`;
    const [secret] = await db<{ value: string }[]>`SELECT value FROM daybook_settings WHERE key = 'session_secret'`;

    expect(pinHash && secret).toBeTruthy();
    expect(text).not.toContain(pinHash!.value);
    expect(text).not.toContain(secret!.value);
    expect(text).not.toContain("settings");
  });

  it("succeeds concurrently with a write against the live database", async () => {
    const db = await makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    await db`INSERT INTO daybook_workers (name, joined_on, paid_leaves_per_cycle) VALUES ('Before Backup', '2020-01-01', 2)`;

    // Kick off the backup request and, without awaiting it first, perform a
    // write through the app — the export's read-only snapshot transaction
    // must not block, or be broken by, ordinary family usage.
    const backupPromise = app.request("/api/backup", { headers: { cookie } });
    const writeRes = await app.request("/api/workers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "During Backup", rate: 100, cycleStartDay: 1 }),
    });
    const backupRes = await backupPromise;

    expect(writeRes.status).toBe(200);
    expect(backupRes.status).toBe(200);

    const body = (await backupRes.json()) as BackupBody;
    expect(body.tables.workers?.map((w) => w.name)).toContain("Before Backup");
  });
});
