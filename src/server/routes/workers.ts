import type { Context } from "hono";
import { Hono } from "hono";
import type Database from "better-sqlite3";
import { computeSettlement, cycleWindows } from "../../shared/settlement";
import type { CycleWindow, Settlement } from "../../shared/settlement";
import {
  addDaysISO,
  loadCycleConfigs,
  loadMarks,
  loadRatePeriods,
  loadWorker,
  listActiveWorkers,
  rateOn,
  startDayOn,
  todayISO,
} from "../lib/workers";

// How many past Cycle windows GET /workers/:id/cycles returns per page.
// Tickets 05/06 page further back by re-calling with ?before=<nextBefore>.
const PAST_PAGE_SIZE = 12;

async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** SPEC.md §1.1: Cycle start day is an integer 1-28 (every month has that day, no short-month edge cases). */
function isValidCycleStartDay(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 28;
}

function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function cycleProgress(window: CycleWindow, today: string): number {
  const start = toEpochDay(window.start);
  const end = toEpochDay(window.end);
  const totalDays = end - start + 1;
  if (totalDays <= 0) return 1;
  const clampedToday = today < window.start ? window.start : today > window.end ? window.end : today;
  const doneDays = toEpochDay(clampedToday) - start + 1;
  return Math.max(0, Math.min(1, doneDays / totalDays));
}

function toEpochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * Worker lifecycle + Home cards + Worker hub data (ticket 04 — SPEC.md §1,
 * §4). Mounted at "/api" from src/server/index.ts (same pattern as
 * routes/auth.ts), landing at:
 *   GET   /api/home
 *   POST  /api/workers
 *   GET   /api/workers/:id
 *   PATCH /api/workers/:id
 *   POST  /api/workers/:id/rate
 *   POST  /api/workers/:id/cycle-config
 *   GET   /api/workers/:id/cycles
 * All gated by the session middleware already mounted on "/api/*" in
 * index.ts — nothing here needs to touch auth.
 *
 * Tickets 05 (marks.ts) and 06 (payments.ts) own their own route files and
 * read Worker/RatePeriod/CycleConfig/Mark rows via ../lib/workers.ts, same
 * as this file — no shared mutable state, no imports from this file needed.
 */
export function createWorkersRoute(db: Database.Database): Hono {
  const route = new Hono();

  route.get("/home", (c) => {
    const today = todayISO();
    const cards = listActiveWorkers(db).map((worker) => {
      const cycleConfigs = loadCycleConfigs(db, worker.id);
      const ratePeriods = loadRatePeriods(db, worker.id);
      const marks = loadMarks(db, worker.id);
      const { current } = cycleWindows(worker, cycleConfigs, today);
      const settlement = computeSettlement(worker, current, marks, ratePeriods, today);
      return {
        id: worker.id,
        name: worker.name,
        role: worker.role,
        avatarInitial: worker.name.trim().charAt(0).toUpperCase() || "?",
        paidLeavesPerCycle: worker.paidLeavesPerCycle,
        leavesUsed: settlement.counts.paidLeave + settlement.counts.unpaidLeave,
        amount: settlement.total,
        window: current,
        progress: cycleProgress(current, today),
      };
    });
    return c.json({ workers: cards });
  });

  route.post("/workers", async (c) => {
    const body = await readJsonBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : null;
    const rate = body.rate;
    const cycleStartDay = body.cycleStartDay;
    const quota = body.quota ?? 2;

    if (!name) return c.json({ error: "name is required" }, 400);
    if (!isPositiveInt(rate)) {
      return c.json({ error: "rate must be a positive whole number of rupees" }, 400);
    }
    if (!isValidCycleStartDay(cycleStartDay)) {
      return c.json({ error: "cycle start day must be between 1 and 28" }, 400);
    }
    if (!isNonNegInt(quota)) {
      return c.json({ error: "paid-leave quota must be a non-negative whole number" }, 400);
    }

    const joinedOn = todayISO();

    // A new Worker's joined_on doubles as the first rate_periods and
    // cycle_configs row's effective_from (SPEC.md §1.1, §2) — all three
    // writes happen together or not at all.
    const workerId = db.transaction(() => {
      const info = db
        .prepare("INSERT INTO workers (name, role, joined_on, paid_leaves_per_cycle) VALUES (?, ?, ?, ?)")
        .run(name, role, joinedOn, quota);
      const id = Number(info.lastInsertRowid);
      db.prepare(
        "INSERT INTO rate_periods (worker_id, rate_rupees, effective_from) VALUES (?, ?, ?)",
      ).run(id, rate, joinedOn);
      db.prepare(
        "INSERT INTO cycle_configs (worker_id, start_day, effective_from) VALUES (?, ?, ?)",
      ).run(id, cycleStartDay, joinedOn);
      return id;
    })();

    return c.json({ id: workerId });
  });

  route.get("/workers/:id", (c) => {
    const id = Number(c.req.param("id"));
    const worker = loadWorker(db, id);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const ratePeriods = loadRatePeriods(db, id);
    const cycleConfigs = loadCycleConfigs(db, id);
    const today = todayISO();

    return c.json({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      joinedOn: worker.joinedOn,
      archivedOn: worker.archivedOn,
      paidLeavesPerCycle: worker.paidLeavesPerCycle,
      currentRate: rateOn(ratePeriods, today),
      currentCycleStartDay: startDayOn(cycleConfigs, today),
      ratePeriods,
      cycleConfigs,
    });
  });

  route.patch("/workers/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const worker = loadWorker(db, id);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const body = await readJsonBody(c);

    if (body.quota !== undefined) {
      if (!isNonNegInt(body.quota)) {
        return c.json({ error: "paid-leave quota must be a non-negative whole number" }, 400);
      }
      db.prepare("UPDATE workers SET paid_leaves_per_cycle = ? WHERE id = ?").run(body.quota, id);
    }

    // Archiving is one-way and idempotent (SPEC.md §1.10: no hard delete,
    // "hides ... history and Payments kept forever"). Re-archiving an
    // already-archived Worker is a no-op, not an error.
    if (body.archive === true && !worker.archivedOn) {
      db.prepare("UPDATE workers SET archived_on = ? WHERE id = ?").run(todayISO(), id);
    }

    const updated = loadWorker(db, id);
    if (!updated) return c.json({ error: "worker not found" }, 404);

    return c.json({
      id: updated.id,
      name: updated.name,
      role: updated.role,
      joinedOn: updated.joinedOn,
      archivedOn: updated.archivedOn,
      paidLeavesPerCycle: updated.paidLeavesPerCycle,
    });
  });

  route.post("/workers/:id/rate", async (c) => {
    const id = Number(c.req.param("id"));
    const worker = loadWorker(db, id);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const body = await readJsonBody(c);
    const rate = body.rate;
    const effectiveFrom =
      typeof body.effectiveFrom === "string" && body.effectiveFrom ? body.effectiveFrom : todayISO();

    if (!isPositiveInt(rate)) {
      return c.json({ error: "rate must be a positive whole number of rupees" }, 400);
    }
    if (!isISODate(effectiveFrom)) {
      return c.json({ error: "effectiveFrom must be an ISO date" }, 400);
    }
    if (effectiveFrom < worker.joinedOn) {
      return c.json({ error: "effective-from date can't be before the worker joined" }, 400);
    }

    db.prepare(
      "INSERT INTO rate_periods (worker_id, rate_rupees, effective_from) VALUES (?, ?, ?)",
    ).run(id, rate, effectiveFrom);

    return c.json({ ok: true, effectiveFrom });
  });

  route.post("/workers/:id/cycle-config", async (c) => {
    const id = Number(c.req.param("id"));
    const worker = loadWorker(db, id);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const body = await readJsonBody(c);
    const startDay = body.startDay;
    if (!isValidCycleStartDay(startDay)) {
      return c.json({ error: "cycle start day must be between 1 and 28" }, 400);
    }

    const cycleConfigs = loadCycleConfigs(db, id);
    const today = todayISO();
    const { current } = cycleWindows(worker, cycleConfigs, today);

    // SPEC.md §1.8: a cycle-start-day change takes effect only after the
    // *current* Cycle completes — one Stub cycle bridges to the new day.
    // This is why effective_from is derived from the current window's end,
    // not from today.
    const effectiveFrom = addDaysISO(current.end, 1);

    db.prepare(
      "INSERT INTO cycle_configs (worker_id, start_day, effective_from) VALUES (?, ?, ?)",
    ).run(id, startDay, effectiveFrom);

    return c.json({ ok: true, effectiveFrom });
  });

  route.get("/workers/:id/cycles", (c) => {
    const id = Number(c.req.param("id"));
    const loaded = loadWorker(db, id);
    if (!loaded) return c.json({ error: "worker not found" }, 404);
    const worker = loaded; // narrowed non-null, safe to close over below

    const before = c.req.query("before");
    if (before !== undefined && !isISODate(before)) {
      return c.json({ error: "before must be an ISO date" }, 400);
    }

    const ratePeriods = loadRatePeriods(db, id);
    const cycleConfigs = loadCycleConfigs(db, id);
    const marks = loadMarks(db, id);
    const today = todayISO();

    const windows = cycleWindows(worker, cycleConfigs, today);

    function entry(win: CycleWindow): { window: CycleWindow; settlement: Settlement } {
      return { window: win, settlement: computeSettlement(worker, win, marks, ratePeriods, today) };
    }

    const current = entry(windows.current);

    const past: Array<{ window: CycleWindow; settlement: Settlement }> = [];
    let hasMore = false;
    for (const win of windows.past()) {
      if (before !== undefined && win.end >= before) continue; // not older than the cursor yet
      if (past.length === PAST_PAGE_SIZE) {
        hasMore = true;
        break;
      }
      past.push(entry(win));
    }
    // Resume cursor: the oldest window returned in this page. The next call
    // with before=<that window's start> will pick up immediately after it —
    // windows are contiguous, so no gap or duplicate is possible.
    const nextBefore = hasMore && past.length > 0 ? past[past.length - 1]!.window.start : null;

    return c.json({ current, past, nextBefore });
  });

  return route;
}
