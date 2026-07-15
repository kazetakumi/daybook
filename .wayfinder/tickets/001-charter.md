---
id: 1
title: "Charter: destination and core salary rules"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

What is this effort's destination, and what are the non-negotiable domain rules of the attendance/salary scheme?

## Resolution

Settled in the charting grilling session (2026-07-15), confirmed by Akhil.

**Destination:** build-ready spec for phase 1 only (mobile web app). React Native / app stores deferred to a future effort.

**Workers:** multiple workers supported; each has a name, a direct **₹X/day** rate, and a configurable pay-cycle start day (1→1, 10→10, etc.). Every calendar day is a working day (7-day week, no weekly offs).

**Day states — exactly one per worker per day:**
1. **Present** — full day's pay.
2. **Absent (worker's leave)** — first 2 per cycle paid in full, 3rd onward unpaid. Paid/unpaid is decided automatically from the quota, not marked manually.
3. **Employer-off** (employer told the worker not to come) — half day's pay; does **not** consume the 2-leave quota.

**Defaults & editing:** an unmarked day counts as Present; any past day can be edited at any time (no locking after settlement).

**Settlement:** per cycle, amount due = full-pay days × rate + half-pay days × rate/2. Pure attendance math — no advances, bonuses, or deductions. Leave quota resets each cycle.

**Product shape:** mobile-friendly web app; Vite React front end + Express or Hono API (choice pending); SQLite file DB; hosted on Akhil's machine, exposed via localtunnel (viability pending research); access via a single PIN shared with family, session cookie after entry.

**Screens:** Today (mark all workers), per-worker cycle calendar with tap-to-edit, cycle settlement summary, worker management — plus past-cycle history, a shareable payday settlement summary, and a daily marking reminder.
