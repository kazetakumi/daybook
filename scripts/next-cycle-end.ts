// scripts/next-cycle-end.ts
//
// Read-only ops helper for the "settlement-eve" ntfy reminder (SPEC.md section 10,
// docs/ops-setup.md). Answers: "does any active Worker's current Cycle end
// tomorrow?" - the day the app calls settlement-eve, when a missed Leave/Off
// mark is still cheaply fixable.
//
// Reuses the app's own cycleWindows() from src/shared/settlement.ts instead
// of reimplementing Cycle-window math (stubs, start-day changes, etc.) -
// see SPEC.md section 1.6 / section 3 for the rules this logic follows.
//
// Opens data/daybook.sqlite READ-ONLY (better-sqlite3 `{ readonly: true }`).
// This script never writes to the database and never creates it.
//
// Usage:
//   npx tsx scripts/next-cycle-end.ts            Human-readable report on
//                                                 stdout.
//   npx tsx scripts/next-cycle-end.ts --check     Silent: exit code 0 means
//                                                 "tomorrow is a cycle end
//                                                 for >=1 active worker, send
//                                                 the ntfy ping"; exit code 1
//                                                 means "skip today". Exit
//                                                 code 2 means the database
//                                                 doesn't exist. Intended for
//                                                 the Task Scheduler job in
//                                                 scripts/register-scheduled-tasks.ps1.

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cycleWindows, type CycleConfig, type Worker } from "../src/shared/settlement";

const DB_PATH = join(process.cwd(), "data", "daybook.sqlite");

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const checkMode = process.argv.includes("--check");

if (!existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH} - nothing to check.`);
  process.exit(2);
}

// readonly + fileMustExist: never creates or mutates the live DB, even
// accidentally (schema.sql init in src/server/db.ts is intentionally not
// reachable from this script).
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

interface WorkerRow {
  id: number;
  name: string;
  role: string | null;
  joined_on: string;
  archived_on: string | null;
  paid_leaves_per_cycle: number;
}

interface CycleConfigRow {
  start_day: number;
  effective_from: string;
}

const today = todayISO();
const tomorrow = addDaysISO(today, 1);

const workerRows = db
  .prepare("SELECT id, name, role, joined_on, archived_on, paid_leaves_per_cycle FROM workers WHERE archived_on IS NULL")
  .all() as WorkerRow[];

const cycleConfigStmt = db.prepare("SELECT start_day, effective_from FROM cycle_configs WHERE worker_id = ? ORDER BY effective_from ASC");

let earliestEnd: string | null = null;
const dueTomorrow: string[] = [];

for (const row of workerRows) {
  const worker: Worker = {
    id: row.id,
    name: row.name,
    role: row.role,
    joinedOn: row.joined_on,
    archivedOn: row.archived_on,
    paidLeavesPerCycle: row.paid_leaves_per_cycle,
  };

  const configRows = cycleConfigStmt.all(row.id) as CycleConfigRow[];
  if (configRows.length === 0) continue; // defensive: shouldn't happen per schema invariants

  const configs: CycleConfig[] = configRows.map((c) => ({
    startDay: c.start_day,
    effectiveFrom: c.effective_from,
  }));

  const { current } = cycleWindows(worker, configs, today);
  if (earliestEnd === null || current.end < earliestEnd) earliestEnd = current.end;
  if (current.end === tomorrow) dueTomorrow.push(row.name);
}

db.close();

const isSettlementEve = dueTomorrow.length > 0;

if (checkMode) {
  process.exit(isSettlementEve ? 0 : 1);
}

console.log(`Today: ${today}`);
console.log(`Active workers: ${workerRows.length}`);
console.log(`Earliest upcoming cycle end (of active workers' current cycles): ${earliestEnd ?? "n/a"}`);
if (isSettlementEve) {
  console.log(`Settlement eve: YES - cycle ends tomorrow (${tomorrow}) for: ${dueTomorrow.join(", ")}`);
} else {
  console.log(`Settlement eve: no - no active worker's cycle ends tomorrow (${tomorrow}).`);
}
