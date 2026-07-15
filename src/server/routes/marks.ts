import type { Context } from "hono";
import { Hono } from "hono";
import type Database from "better-sqlite3";
import { loadWorker, todayISO } from "../lib/workers";

// Marking days (ticket 05 — SPEC.md §1.3-§1.5, §7). Mounted at "/api/marks"
// from src/server/index.ts (same pattern as routes/workers.ts), landing at:
//   PUT /api/marks/:workerId/:date   {state: 'leave'|'off'|'present'}
//   GET /api/marks/:workerId?from=&to=
// Marks are exceptions-only storage (schema.sql: present = no row) — PUT
// with state 'present' deletes the row rather than writing one.

function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createMarksRoute(db: Database.Database): Hono {
  const route = new Hono();

  route.put("/:workerId/:date", async (c) => {
    const workerId = Number(c.req.param("workerId"));
    const date = c.req.param("date");

    const worker = loadWorker(db, workerId);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    if (!isISODate(date)) {
      return c.json({ error: "date must be an ISO date" }, 400);
    }

    const body = await readJsonBody(c);
    const state = body.state;
    if (state !== "leave" && state !== "off" && state !== "present") {
      return c.json({ error: "state must be one of 'leave', 'off', 'present'" }, 400);
    }

    const today = todayISO();
    // SPEC.md §1.4: "days after today cannot be marked". Any past day
    // (including in a previous Cycle window) is editable at any time — no
    // window-boundary check here, that's a UI concern (hidden cells), not a
    // server rule.
    if (date > today) {
      return c.json({ error: "cannot mark a day after today" }, 400);
    }
    // A day before the worker joined has no attendance to record.
    if (date < worker.joinedOn) {
      return c.json({ error: "cannot mark a day before the worker joined" }, 400);
    }

    if (state === "present") {
      db.prepare("DELETE FROM marks WHERE worker_id = ? AND date = ?").run(workerId, date);
    } else {
      db.prepare(
        `INSERT INTO marks (worker_id, date, state) VALUES (?, ?, ?)
         ON CONFLICT(worker_id, date) DO UPDATE SET state = excluded.state`,
      ).run(workerId, date, state);
    }

    return c.json({ ok: true, workerId, date, state });
  });

  route.get("/:workerId", (c) => {
    const workerId = Number(c.req.param("workerId"));
    const worker = loadWorker(db, workerId);
    if (!worker) return c.json({ error: "worker not found" }, 404);

    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from !== undefined && !isISODate(from)) {
      return c.json({ error: "from must be an ISO date" }, 400);
    }
    if (to !== undefined && !isISODate(to)) {
      return c.json({ error: "to must be an ISO date" }, 400);
    }

    const rows =
      from !== undefined && to !== undefined
        ? (db
            .prepare(
              "SELECT date, state FROM marks WHERE worker_id = ? AND date >= ? AND date <= ? ORDER BY date ASC",
            )
            .all(workerId, from, to) as Array<{ date: string; state: "leave" | "off" }>)
        : (db
            .prepare("SELECT date, state FROM marks WHERE worker_id = ? ORDER BY date ASC")
            .all(workerId) as Array<{ date: string; state: "leave" | "off" }>);

    return c.json({ marks: rows });
  });

  return route;
}
