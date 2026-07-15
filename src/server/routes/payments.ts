import type { Context } from "hono";
import { Hono } from "hono";
import type Database from "better-sqlite3";
import { computeSettlement } from "../../shared/settlement";
import { loadMarks, loadRatePeriods, loadWorker, todayISO } from "../lib/workers";

// Payments (ticket 06 — SPEC.md §1.9, §7). Mounted at "/api/payments" from
// src/server/index.ts (same pattern as routes/workers.ts), landing at:
//   GET  /api/payments/:workerId  — every Payment snapshot for a Worker
//   POST /api/payments            — {workerId, periodStart, periodEnd}, snapshots
//                                    the LIVE-recomputed total for that window
// Gated by the session middleware already mounted on "/api/*" in index.ts.
//
// Per ADR-0001 the stored amount is never client-supplied: the server
// recomputes computeSettlement() itself right at insert time so the
// snapshot is always "the computed total at that moment", immune to a
// stale client. Days stay editable afterward — this route never locks
// marks, cycle_configs, or rate_periods; a later edit just makes the
// Settle pane's Drift banner appear (computed vs. this stored amount).

interface PaymentRow {
  id: number;
  worker_id: number;
  period_start: string;
  period_end: string;
  amount_rupees: number;
  paid_on: string;
}

function toApiPayment(row: PaymentRow) {
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amount: row.amount_rupees,
    paidOn: row.paid_on,
  };
}

async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function createPaymentsRoute(db: Database.Database): Hono {
  const route = new Hono();

  /** GET /api/payments/:workerId — all Payment snapshots, oldest window first. */
  route.get("/:workerId", (c) => {
    const workerId = Number(c.req.param("workerId"));
    if (!Number.isInteger(workerId)) return c.json({ error: "invalid worker id" }, 400);

    const worker = loadWorker(db, workerId);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const rows = db
      .prepare(
        "SELECT id, worker_id, period_start, period_end, amount_rupees, paid_on FROM payments WHERE worker_id = ? ORDER BY period_start ASC",
      )
      .all(workerId) as PaymentRow[];

    return c.json({ payments: rows.map(toApiPayment) });
  });

  /**
   * POST /api/payments {workerId, periodStart, periodEnd} — "Mark paid".
   * Rejects windows that haven't closed yet (periodEnd >= today): the
   * Settle pane only ever offers this for past cycles. Idempotent — a
   * second call for a window that's already paid returns the existing
   * snapshot unchanged rather than inserting a duplicate row, so a
   * double-tap or a retried request can't silently overwrite what was
   * actually handed over.
   */
  route.post("/", async (c) => {
    const body = await readJsonBody(c);
    const workerId = body.workerId;
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;

    if (typeof workerId !== "number" || !Number.isInteger(workerId)) {
      return c.json({ error: "workerId is required" }, 400);
    }
    if (!isISODate(periodStart) || !isISODate(periodEnd)) {
      return c.json({ error: "periodStart and periodEnd must be ISO dates" }, 400);
    }
    if (periodStart > periodEnd) {
      return c.json({ error: "periodStart must not be after periodEnd" }, 400);
    }

    const worker = loadWorker(db, workerId);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const today = todayISO();
    if (periodEnd >= today) {
      return c.json({ error: "this cycle hasn't closed yet" }, 400);
    }

    const existing = db
      .prepare(
        "SELECT id, worker_id, period_start, period_end, amount_rupees, paid_on FROM payments WHERE worker_id = ? AND period_start = ? AND period_end = ?",
      )
      .get(workerId, periodStart, periodEnd) as PaymentRow | undefined;
    if (existing) {
      return c.json(toApiPayment(existing));
    }

    const ratePeriods = loadRatePeriods(db, workerId);
    const marks = loadMarks(db, workerId);
    const settlement = computeSettlement(
      worker,
      { start: periodStart, end: periodEnd, open: false },
      marks,
      ratePeriods,
      today,
    );

    const paidOn = today;
    db.prepare(
      "INSERT INTO payments (worker_id, period_start, period_end, amount_rupees, paid_on) VALUES (?, ?, ?, ?, ?)",
    ).run(workerId, periodStart, periodEnd, settlement.total, paidOn);

    return c.json({ periodStart, periodEnd, amount: settlement.total, paidOn });
  });

  return route;
}
