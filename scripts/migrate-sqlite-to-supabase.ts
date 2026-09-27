// scripts/migrate-sqlite-to-supabase.ts
//
// ONE-SHOT cutover tool (ADR-0002): copies a Daybook SQLite database into the
// daybook_* tables named by DATABASE_URL, keeping every original id, then
// proves the copy before committing. Delete this script (and the
// better-sqlite3 devDependency) once a full pay Cycle has been settled on
// Supabase — see docs/ops-setup.md.
//
// Usage (stop the live server first, so the SQLite WAL is checkpointed and
// nobody marks a day mid-copy):
//   npx tsx --env-file-if-exists=.env scripts/migrate-sqlite-to-supabase.ts <path/to/daybook.sqlite> [--dry-run]
//
// Everything happens in ONE Postgres transaction:
//   1. refuse unless every daybook_* table is empty (never merges, never overwrites)
//   2. insert all six tables' rows with their original ids — settings
//      included, so the family PIN and every phone's session carry over
//   3. move each identity sequence past the highest copied id
//   4. verify: every table's rows are identical on both sides, and every
//      Cycle of every Worker settles to the same total from both sources
// Any mismatch throws and rolls the whole copy back. --dry-run does all four
// steps, then rolls back anyway.
//
// The SQLite file is opened read-only and is never modified.

import Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { getDb, type Sql } from "../src/server/db";
import { loadCycleConfigs, loadMarks, loadRatePeriods, loadWorker } from "../src/server/lib/workers";
import { computeSettlement, cycleWindows } from "../src/shared/settlement";
import type { CycleConfig, Mark, RatePeriod, Worker } from "../src/shared/settlement";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sqlitePath = args.find((a) => !a.startsWith("--"));
if (!sqlitePath) {
  console.error("usage: migrate-sqlite-to-supabase.ts <path/to/daybook.sqlite> [--dry-run]");
  process.exit(2);
}

/** SQLite table -> Postgres table, and the columns both share, in parent-before-child order. */
const TABLES = [
  { from: "workers", to: "daybook_workers", cols: ["id", "name", "role", "joined_on", "archived_on", "paid_leaves_per_cycle"], order: "id", identity: true },
  { from: "rate_periods", to: "daybook_rate_periods", cols: ["id", "worker_id", "rate_rupees", "effective_from"], order: "id", identity: true },
  { from: "cycle_configs", to: "daybook_cycle_configs", cols: ["id", "worker_id", "start_day", "effective_from"], order: "id", identity: true },
  { from: "marks", to: "daybook_marks", cols: ["worker_id", "date", "state"], order: "worker_id, date", identity: false },
  { from: "payments", to: "daybook_payments", cols: ["id", "worker_id", "period_start", "period_end", "amount_rupees", "paid_on"], order: "id", identity: true },
  { from: "settings", to: "daybook_settings", cols: ["key", "value"], order: "key", identity: false },
] as const;

type Row = Record<string, unknown>;

class RolledBack extends Error {}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const lite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const source = new Map<string, Row[]>(
  TABLES.map((t) => [t.from, lite.prepare(`SELECT ${t.cols.join(", ")} FROM ${t.from} ORDER BY ${t.order}`).all() as Row[]]),
);

/** Settlement totals for every Cycle of every Worker, keyed "workerId start..end". */
function settleAll(load: (id: number) => { worker: Worker; configs: CycleConfig[]; rates: RatePeriod[]; marks: Mark[] }, ids: number[]) {
  const today = todayISO();
  const totals = new Map<string, number>();
  for (const id of ids) {
    const { worker, configs, rates, marks } = load(id);
    const windows = cycleWindows(worker, configs, today);
    for (const win of [windows.current, ...windows.past()]) {
      totals.set(`${id} ${win.start}..${win.end}`, computeSettlement(worker, win, marks, rates, today).total);
    }
  }
  return totals;
}

const sql = getDb();
let exitCode = 0;
try {
  await sql.begin(async (tx) => {
    // 1. Target must be empty.
    for (const t of TABLES) {
      const [row] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM ${tx(t.to)}`;
      if (row!.n > 0) throw new Error(`${t.to} already has ${row!.n} row(s) — refusing to merge into existing data`);
    }

    // 2. Copy with original ids.
    for (const t of TABLES) {
      const rows = source.get(t.from)!;
      if (rows.length === 0) continue;
      await tx`INSERT INTO ${tx(t.to)} ${tx(rows, ...t.cols)}`;
    }

    // 3. Next identity value = highest copied id + 1.
    for (const t of TABLES.filter((t) => t.identity)) {
      await tx`SELECT setval(pg_get_serial_sequence(${t.to}, 'id'), COALESCE(MAX(id), 0) + 1, false) FROM ${tx(t.to)}`;
    }

    // 4a. Row-for-row identical.
    for (const t of TABLES) {
      const copied = [...(await tx.unsafe(`SELECT ${t.cols.join(", ")} FROM ${t.to} ORDER BY ${t.order}`))];
      const expected = source.get(t.from)!;
      if (!isDeepStrictEqual(copied.map((r) => ({ ...r })), expected)) {
        throw new Error(`${t.from}: copied rows differ from the SQLite source`);
      }
      console.log(`  ${t.from.padEnd(14)} ${String(copied.length).padStart(4)} rows  ✓ identical`);
    }

    // 4b. Every Cycle settles identically. The Postgres side goes through the
    // server's own read helpers — the exact code path the app will use.
    const ids = source.get("workers")!.map((w) => w.id as number);
    const pg = tx as unknown as Sql;
    const pgData = new Map<number, { worker: Worker; configs: CycleConfig[]; rates: RatePeriod[]; marks: Mark[] }>();
    for (const id of ids) {
      pgData.set(id, {
        worker: (await loadWorker(pg, id))!,
        configs: await loadCycleConfigs(pg, id),
        rates: await loadRatePeriods(pg, id),
        marks: await loadMarks(pg, id),
      });
    }
    const liteData = (id: number) => {
      const w = lite.prepare("SELECT * FROM workers WHERE id = ?").get(id) as Row;
      return {
        worker: {
          id,
          name: w.name as string,
          role: w.role as string | null,
          joinedOn: w.joined_on as string,
          archivedOn: w.archived_on as string | null,
          paidLeavesPerCycle: w.paid_leaves_per_cycle as number,
        },
        configs: (lite.prepare("SELECT start_day, effective_from FROM cycle_configs WHERE worker_id = ? ORDER BY effective_from, id").all(id) as Row[])
          .map((r) => ({ startDay: r.start_day as number, effectiveFrom: r.effective_from as string })),
        rates: (lite.prepare("SELECT rate_rupees, effective_from FROM rate_periods WHERE worker_id = ? ORDER BY effective_from, id").all(id) as Row[])
          .map((r) => ({ rateRupees: r.rate_rupees as number, effectiveFrom: r.effective_from as string })),
        marks: (lite.prepare("SELECT date, state FROM marks WHERE worker_id = ? ORDER BY date").all(id) as Row[])
          .map((r) => ({ date: r.date as string, state: r.state as Mark["state"] })),
      };
    };
    const fromLite = settleAll(liteData, ids);
    const fromPg = settleAll((id) => pgData.get(id)!, ids);
    for (const [cycle, total] of fromLite) {
      if (fromPg.get(cycle) !== total) {
        throw new Error(`settlement mismatch for worker/cycle ${cycle}: SQLite ₹${total}, Postgres ₹${fromPg.get(cycle)}`);
      }
    }
    if (fromPg.size !== fromLite.size) throw new Error(`cycle count mismatch: SQLite ${fromLite.size}, Postgres ${fromPg.size}`);
    console.log(`  settlements    ${String(fromLite.size).padStart(4)} cycles ✓ identical totals`);

    if (dryRun) throw new RolledBack();
  });
  console.log("Committed. Daybook data is now in Supabase.");
} catch (err) {
  if (err instanceof RolledBack) {
    console.log("Dry run: everything verified, then rolled back — Supabase is unchanged.");
  } else {
    console.error(`Migration FAILED and was rolled back — Supabase is unchanged.\n${(err as Error).message}`);
    exitCode = 1;
  }
} finally {
  lite.close();
  await sql.end();
}
process.exit(exitCode);
