import { Hono } from "hono";
import type { Sql } from "../db";
import { todayISO } from "../lib/workers";

// Backup (ticket 08 — SPEC.md §8). Mounted at "/api/backup" from
// src/server/index.ts (same factory-function pattern as routes/payments.ts),
// landing at:
//   GET /api/backup — downloads a point-in-time JSON export of every Daybook table
// Gated by the session middleware already mounted on "/api/*" in index.ts —
// "/api/backup" is not in SESSION_EXEMPT_PATHS (src/server/middleware/session.ts),
// so a request without a valid session cookie never reaches the handler below.
//
// All five reads run inside one REPEATABLE READ transaction, so the export
// is a single consistent snapshot even while family members keep marking
// days. daybook_settings is deliberately left out: the PIN hash and the
// session-signing key have no business sitting in a file on someone's phone.

/**
 * The migration the export's shape corresponds to — bump alongside any
 * supabase/migrations/ change that alters these tables.
 */
export const BACKUP_SCHEMA_VERSION = "20260927120000";

export function createBackupRoute(sql: Sql): Hono {
  const route = new Hono();

  route.get("/", async (c) => {
    try {
      const tables = await sql.begin("isolation level repeatable read read only", async (tx) => {
        const [workers, ratePeriods, cycleConfigs, marks, payments] = [
          await tx`SELECT * FROM daybook_workers ORDER BY id`,
          await tx`SELECT * FROM daybook_rate_periods ORDER BY id`,
          await tx`SELECT * FROM daybook_cycle_configs ORDER BY id`,
          await tx`SELECT * FROM daybook_marks ORDER BY worker_id, date`,
          await tx`SELECT * FROM daybook_payments ORDER BY id`,
        ];
        return {
          workers: [...workers],
          rate_periods: [...ratePeriods],
          cycle_configs: [...cycleConfigs],
          marks: [...marks],
          payments: [...payments],
        };
      });

      const filename = `daybook-${todayISO()}.json`;
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
      return c.json({ exportedAt: new Date().toISOString(), schemaVersion: BACKUP_SCHEMA_VERSION, tables });
    } catch (err) {
      return c.json({ error: `backup failed: ${(err as Error).message}` }, 500);
    }
  });

  return route;
}
