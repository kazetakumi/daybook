import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSessionMiddleware } from "../middleware/session";
import { createAuthRoute } from "./auth";
import { createWorkersRoute } from "./workers";
import { createBackupRoute } from "./backup";

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

const EXPECTED_TABLES = ["workers", "rate_periods", "cycle_configs", "marks", "payments", "settings"];

describe("GET /api/backup without a session", () => {
  it("401s — proves the shared session middleware gates this route too", async () => {
    const app = makeApp(makeDb());
    const res = await app.request("/api/backup");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/backup", () => {
  it("streams a dated .sqlite snapshot containing all six tables and current data", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    db.prepare(
      "INSERT INTO workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (1, 'Seeded Worker', '2020-01-01', 2)",
    ).run();

    const res = await app.request("/api/backup", { headers: { cookie } });
    expect(res.status).toBe(200);

    const today = new Date();
    const expectedName = `daybook-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}.sqlite`;
    expect(res.headers.get("content-disposition")).toContain(`filename="${expectedName}"`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const tempPath = join(tmpdir(), `backup-test-${randomUUID()}.sqlite`);
    writeFileSync(tempPath, buffer);

    try {
      const snapshot = new Database(tempPath, { readonly: true });
      const tableNames = (
        snapshot.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
      ).map((row) => row.name);
      for (const table of EXPECTED_TABLES) {
        expect(tableNames).toContain(table);
      }

      const worker = snapshot.prepare("SELECT name FROM workers WHERE id = 1").get() as { name: string } | undefined;
      expect(worker?.name).toBe("Seeded Worker");
      snapshot.close();
    } finally {
      rmSync(tempPath, { force: true });
    }
  });

  it("succeeds concurrently with a write against the live database (online backup, not a raw file copy)", async () => {
    const db = makeDb();
    const app = makeApp(db);
    const cookie = await loggedInCookie(app);

    db.prepare(
      "INSERT INTO workers (id, name, joined_on, paid_leaves_per_cycle) VALUES (1, 'Before Backup', '2020-01-01', 2)",
    ).run();

    // Kick off the backup request and, without awaiting it first, perform a
    // write against the same live handle — proving GET /api/backup doesn't
    // lock the database out from under concurrent app usage the way copying
    // the raw file while WAL pages are uncommitted could.
    const backupPromise = app.request("/api/backup", { headers: { cookie } });
    const writeRes = await app.request("/api/workers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "During Backup", rate: 100, cycleStartDay: 1 }),
    });
    const backupRes = await backupPromise;

    expect(writeRes.status).toBe(200);
    expect(backupRes.status).toBe(200);

    const buffer = Buffer.from(await backupRes.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
    // A valid SQLite file starts with this 16-byte magic header — cheap
    // corruption check without needing to open it.
    expect(buffer.subarray(0, 16).toString("utf-8")).toBe("SQLite format 3\0");
  });
});
