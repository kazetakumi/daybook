import type Database from "better-sqlite3";
import type { CycleConfig, ISODate, Mark, RatePeriod, Worker } from "../../shared/settlement";

// Row <-> domain mapping and small read helpers shared by the workers route
// (and, later, marks.ts / payments.ts — see src/server/index.ts) so nobody
// re-derives Worker/RatePeriod/CycleConfig/Mark from raw rows independently.

interface WorkerRow {
  id: number;
  name: string;
  role: string | null;
  joined_on: string;
  archived_on: string | null;
  paid_leaves_per_cycle: number;
}

interface RatePeriodRow {
  rate_rupees: number;
  effective_from: string;
}

interface CycleConfigRow {
  start_day: number;
  effective_from: string;
}

interface MarkRow {
  date: string;
  state: "leave" | "off";
}

/** Today in the server's local timezone, ISO `YYYY-MM-DD` (matches settlement.ts's ISODate). */
export function todayISO(): ISODate {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * One calendar day after `iso`. A small local mirror of the date arithmetic
 * private to src/shared/settlement.ts (that module is intentionally I/O-free
 * and doesn't export it) — needed here for SPEC §1.8's "effective the day
 * after the current window ends" cycle-config rule.
 */
export function addDaysISO(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function rowToWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    joinedOn: row.joined_on,
    archivedOn: row.archived_on,
    paidLeavesPerCycle: row.paid_leaves_per_cycle,
  };
}

export function loadWorker(db: Database.Database, id: number): Worker | null {
  const row = db.prepare("SELECT * FROM workers WHERE id = ?").get(id) as WorkerRow | undefined;
  return row ? rowToWorker(row) : null;
}

/** Active (non-archived) Workers, for the Home cards list. */
export function listActiveWorkers(db: Database.Database): Worker[] {
  const rows = db
    .prepare("SELECT * FROM workers WHERE archived_on IS NULL ORDER BY id ASC")
    .all() as WorkerRow[];
  return rows.map(rowToWorker);
}

export function loadRatePeriods(db: Database.Database, workerId: number): RatePeriod[] {
  const rows = db
    .prepare(
      "SELECT rate_rupees, effective_from FROM rate_periods WHERE worker_id = ? ORDER BY effective_from ASC, id ASC",
    )
    .all(workerId) as RatePeriodRow[];
  return rows.map((r) => ({ rateRupees: r.rate_rupees, effectiveFrom: r.effective_from }));
}

export function loadCycleConfigs(db: Database.Database, workerId: number): CycleConfig[] {
  const rows = db
    .prepare(
      "SELECT start_day, effective_from FROM cycle_configs WHERE worker_id = ? ORDER BY effective_from ASC, id ASC",
    )
    .all(workerId) as CycleConfigRow[];
  return rows.map((r) => ({ startDay: r.start_day, effectiveFrom: r.effective_from }));
}

export function loadMarks(db: Database.Database, workerId: number): Mark[] {
  const rows = db
    .prepare("SELECT date, state FROM marks WHERE worker_id = ? ORDER BY date ASC")
    .all(workerId) as MarkRow[];
  return rows.map((r) => ({ date: r.date, state: r.state }));
}

/** The Rate covering `date` (mirrors computeSettlement's private rateFor) — used for Details/home display. */
export function rateOn(ratePeriods: RatePeriod[], date: ISODate): number {
  const sorted = [...ratePeriods].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  let rate = sorted[0]?.rateRupees ?? 0;
  for (const rp of sorted) {
    if (rp.effectiveFrom <= date) rate = rp.rateRupees;
    else break;
  }
  return rate;
}

/** The Cycle start day covering `date` — used for Details display. */
export function startDayOn(cycleConfigs: CycleConfig[], date: ISODate): number {
  const sorted = [...cycleConfigs].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  let day = sorted[0]?.startDay ?? 1;
  for (const cc of sorted) {
    if (cc.effectiveFrom <= date) day = cc.startDay;
    else break;
  }
  return day;
}
