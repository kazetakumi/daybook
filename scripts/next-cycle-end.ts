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
// Reads the daybook_* tables via DATABASE_URL (loaded from .env with
// `tsx --env-file-if-exists=.env`) using the server's own read helpers. This script
// only ever SELECTs - it never writes to the database.
//
// Usage:
//   npx tsx --env-file-if-exists=.env scripts/next-cycle-end.ts
//                                                 Human-readable report on
//                                                 stdout.
//   npx tsx --env-file-if-exists=.env scripts/next-cycle-end.ts --check
//                                                 Silent: exit code 0 means
//                                                 "tomorrow is a cycle end
//                                                 for >=1 active worker, send
//                                                 the ntfy ping"; exit code 1
//                                                 means "skip today". Exit
//                                                 code 2 means the database
//                                                 is unreachable or not
//                                                 configured. Intended for
//                                                 the Task Scheduler job in
//                                                 scripts/register-scheduled-tasks.ps1.

import { getDb } from "../src/server/db";
import { listActiveWorkers, loadCycleConfigs } from "../src/server/lib/workers";
import { cycleWindows } from "../src/shared/settlement";

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

const today = todayISO();
const tomorrow = addDaysISO(today, 1);

let activeCount = 0;
let earliestEnd: string | null = null;
const dueTomorrow: string[] = [];

try {
  const sql = getDb();
  try {
    const workers = await listActiveWorkers(sql);
    activeCount = workers.length;
    for (const worker of workers) {
      const configs = await loadCycleConfigs(sql, worker.id);
      if (configs.length === 0) continue; // defensive: shouldn't happen per schema invariants

      const { current } = cycleWindows(worker, configs, today);
      if (earliestEnd === null || current.end < earliestEnd) earliestEnd = current.end;
      if (current.end === tomorrow) dueTomorrow.push(worker.name);
    }
  } finally {
    await sql.end();
  }
} catch (err) {
  console.error(`Could not read the Daybook database - nothing to check. ${(err as Error).message}`);
  process.exit(2);
}

const isSettlementEve = dueTomorrow.length > 0;

if (checkMode) {
  process.exit(isSettlementEve ? 0 : 1);
}

console.log(`Today: ${today}`);
console.log(`Active workers: ${activeCount}`);
console.log(`Earliest upcoming cycle end (of active workers' current cycles): ${earliestEnd ?? "n/a"}`);
if (isSettlementEve) {
  console.log(`Settlement eve: YES - cycle ends tomorrow (${tomorrow}) for: ${dueTomorrow.join(", ")}`);
} else {
  console.log(`Settlement eve: no - no active worker's cycle ends tomorrow (${tomorrow}).`);
}
