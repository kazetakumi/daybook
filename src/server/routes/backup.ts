import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { todayISO } from "../lib/workers";

// Backup (ticket 08 — SPEC.md §8). Mounted at "/api/backup" from
// src/server/index.ts (same factory-function pattern as routes/payments.ts),
// landing at:
//   GET /api/backup — streams a point-in-time snapshot of the whole database
// Gated by the session middleware already mounted on "/api/*" in index.ts —
// "/api/backup" is not in SESSION_EXEMPT_PATHS (src/server/middleware/session.ts),
// so a request without a valid session cookie never reaches the handler below.
//
// The snapshot is taken with better-sqlite3's *online backup API*
// (`db.backup()`), never a raw `fs.copyFile` of the live .sqlite file — the
// live DB runs in WAL mode (see src/server/db.ts) and can have uncommitted
// WAL pages, so a plain file copy could hand back a corrupt or
// point-in-time-inconsistent snapshot. `db.backup()` uses SQLite's C-level
// backup API, safe to run while the app is being read from and written to
// concurrently (verified in backup.test.ts and by hand — see the ticket).

export function createBackupRoute(db: Database.Database): Hono {
  const route = new Hono();

  route.get("/", async (c) => {
    const tempPath = join(tmpdir(), `daybook-backup-${randomUUID()}.sqlite`);

    try {
      await db.backup(tempPath);
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => {});
      return c.json({ error: `backup failed: ${(err as Error).message}` }, 500);
    }

    // Stream the temp file back rather than buffering it in memory, and only
    // delete it once the stream has actually finished (or errored) — deleting
    // it any earlier risks handing back a truncated download, and on Windows
    // an in-flight read handle can make an earlier unlink fail outright.
    const nodeStream = createReadStream(tempPath);
    const cleanup = () => {
      void rm(tempPath, { force: true }).catch(() => {});
    };
    nodeStream.on("close", cleanup);
    nodeStream.on("error", cleanup);

    const filename = `daybook-${todayISO()}.sqlite`;
    c.header("Content-Type", "application/vnd.sqlite3");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(Readable.toWeb(nodeStream) as ReadableStream);
  });

  return route;
}
