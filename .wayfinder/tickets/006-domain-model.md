---
id: 6
title: "Domain model: entities, schema, and the salary calculation spec"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: [5]
---

## Question

Pin the domain model and the exact salary algorithm, via `/domain-modeling`. Blocked by [cycle edge cases](005-cycle-edge-cases.md) — its answers are inputs here.

- Entities and SQLite schema: Worker, day-status records (store only exceptions given default-Present, or every day?), rate history (if mid-cycle changes split calculations), settlement/cycle records (if an explicit "paid" action exists).
- The salary calculation as a precise, testable function: inputs (worker, cycle window, day statuses, rate timeline) → payable breakdown (full days, paid leaves, unpaid leaves, half-pay days) → amount. Written so the build session can turn it into unit tests directly.
- Ubiquitous language: fix the words the app will use (e.g. "Leave" vs "Absent", "Employer-off" vs "Holiday") — these flow into the UI ticket and spec.

## Resolution

Modeled with Akhil 2026-07-15. Glossary written to [CONTEXT.md](../../CONTEXT.md); the lock-free settlement decision recorded as [ADR-0001](../../docs/adr/0001-live-recomputation-with-payment-snapshots.md).

**Decisions made here:** day states named **Present / Leave / Off** (Leave splits into Paid/Unpaid leave in breakdowns; Off = half pay); paid-leave quota is **per-worker, default 2**; day storage is **exceptions only** (Present = no row); half-rupee amounts kept exact internally, **final cycle total rounds up** to the whole rupee.

**SQLite schema:**

```sql
workers       (id, name, joined_on, archived_on NULL, paid_leaves_per_cycle DEFAULT 2)
rate_periods  (id, worker_id, rate_rupees, effective_from)    -- first row at joined_on
cycle_configs (id, worker_id, start_day CHECK 1-28, effective_from)  -- first row at joined_on
marks         (worker_id, date, state 'leave'|'off', PRIMARY KEY(worker_id, date))
payments      (id, worker_id, period_start, period_end, amount_rupees, paid_on)
settings      (key, value)                                    -- pin_hash, ntfy_topic, …
```

**Cycle generation (one rule for joins and start-day changes):** from a config row `(D, effective_from F)`: first cycle is a stub `F → day-before-next-D` (skipped if F falls on D), then regular `D → day-before-next-D` cycles until the next config row or `archived_on`.

**Salary function (pure):**

```
computeSettlement(worker, cycleWindow, marks, ratePeriods) → Settlement
  days       = dates in cycleWindow ∩ [joined_on, archived_on]
  state(d)   = mark(d) ?? Present
  paidLeaves = earliest `quota` Leave dates in the window; remaining Leaves are Unpaid
  fraction   = Present 1 · Paid leave 1 · Off 0.5 · Unpaid leave 0
  rate(d)    = rate_period covering d
  total      = ceil( Σ fraction(d) × rate(d) )      -- round final total UP to whole ₹
  → breakdown counts, per-rate segments, total, and drift vs any payment for the window
```

**Worked examples (spec test fixtures):**
1. ₹200/day, cycle Jun 1–30, Leaves 5/12/20, Off 25, quota 2 → 26×200 + 2×200 + 0 + 100 = **₹5,700**.
2. Rate ₹175→₹185 effective Jun 16, Off Jun 10, Leave Jun 20 → (14×175 + 87.50) + (15×185) = 5,312.50 → **₹5,313**.
3. Joins Jun 20 with start day 1 → stub Jun 20–30, full quota 2 applies.
