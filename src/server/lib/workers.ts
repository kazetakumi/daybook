import type { Sql } from "../db";
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

/** Postgres `integer` bounds — anything outside can't be a row id, and would error if sent as one. */
function isIntId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= 2_147_483_647;
}

export async function loadWorker(sql: Sql, id: number): Promise<Worker | null> {
  if (!isIntId(id)) return null;
  const [row] = await sql<WorkerRow[]>`SELECT * FROM daybook_workers WHERE id = ${id}`;
  return row ? rowToWorker(row) : null;
}

/** Active (non-archived) Workers, for the Home cards list. */
export async function listActiveWorkers(sql: Sql): Promise<Worker[]> {
  const rows = await sql<WorkerRow[]>`SELECT * FROM daybook_workers WHERE archived_on IS NULL ORDER BY id ASC`;
  return rows.map(rowToWorker);
}

export async function loadRatePeriods(sql: Sql, workerId: number): Promise<RatePeriod[]> {
  const rows = await sql<RatePeriodRow[]>`
    SELECT rate_rupees, effective_from FROM daybook_rate_periods
    WHERE worker_id = ${workerId} ORDER BY effective_from ASC, id ASC
  `;
  return rows.map((r) => ({ rateRupees: r.rate_rupees, effectiveFrom: r.effective_from }));
}

export async function loadCycleConfigs(sql: Sql, workerId: number): Promise<CycleConfig[]> {
  const rows = await sql<CycleConfigRow[]>`
    SELECT start_day, effective_from FROM daybook_cycle_configs
    WHERE worker_id = ${workerId} ORDER BY effective_from ASC, id ASC
  `;
  return rows.map((r) => ({ startDay: r.start_day, effectiveFrom: r.effective_from }));
}

export async function loadMarks(sql: Sql, workerId: number): Promise<Mark[]> {
  const rows = await sql<MarkRow[]>`
    SELECT date, state FROM daybook_marks WHERE worker_id = ${workerId} ORDER BY date ASC
  `;
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
