---
title: "Maid attendance & salary app — phase 1 spec"
labels: [wayfinder:map]
status: closed
---

> **Map closed 2026-07-15** — destination reached: [SPEC.md](../SPEC.md) is the build-ready spec. Nothing left to decide; the next effort is building from the spec.

# Maid attendance & salary app — phase 1 spec

## Destination

A build-ready spec for phase 1: a mobile-friendly web app (Vite React + Express/Hono API, SQLite, hosted locally and exposed via a tunnel) that lets the household mark daily attendance for multiple workers and computes each pay-cycle's salary. Spec complete = every open decision below resolved and assembled into one document a build session can execute without asking questions.

## Notes

- Domain: personal household-help management, India, amounts in ₹. Single household; users are the employer and family sharing a PIN.
- Core rules were settled in [Charter: destination and core salary rules](tickets/001-charter.md) — read it before working any ticket.
- Skills to consult: `/grilling` and `/domain-modeling` for decision tickets, `/prototype` for UI tickets, `/research` for research tickets.
- Standing preference: this map is pure planning. Tickets resolve decisions; the only artifacts are the spec and throwaway prototypes. Building the app happens after this map, from the spec.
- Tracker: local markdown. Tickets live in `tickets/`, one file each, frontmatter `status: open|closed`, `assignee`, `blocked-by: [ids]`. A ticket is claimed by setting `assignee`. Resolution = a `## Resolution` section appended to the ticket + `status: closed` + a line added below.

## Decisions so far

- [Charter: destination and core salary rules](tickets/001-charter.md) — Daily-rate workers, 2 paid leaves/cycle, employer-off = half pay; 3 day-states defaulting to Present; configurable cycle start; Vite React + Express/Hono + SQLite behind a family PIN, tunneled.
- [Research: is localtunnel viable for exposing the app to family phones?](tickets/002-research-tunnel.md) — No: its IP-password interstitial and unstable subdomains disqualify it; use Tailscale Funnel for a free, stable, interstitial-free HTTPS origin (`<machine>.<tailnet>.ts.net`).
- [Research: how should the daily marking reminder reach the family's phones?](tickets/003-research-reminder.md) — Skip Web Push; ntfy.sh app + secret topic curled by a Windows scheduled task, settlement-eve (+ optional weekly) cadence since unmarked days default to Present; Telegram bot as fallback.
- [Grilling: cycle boundaries, mid-cycle changes, and quota edge cases](tickets/005-cycle-edge-cases.md) — Start days 1–28 only; rate changes via effective-from date with rate history; cycle/join changes bridge with full-quota stub cycles; departed workers archived; "Mark paid" snapshots amount and shows drift vs later edits; paid leaves = 2 earliest absences by calendar date, recomputed live.
- [Domain model: entities, schema, and the salary calculation spec](tickets/006-domain-model.md) — Present/Leave/Off language (glossary in CONTEXT.md); 6-table SQLite schema with exceptions-only marks; pure computeSettlement function with worked examples; per-worker quota; totals round up to whole ₹; lock-free settlement recorded as ADR-0001.
- [Prototype: the four core screens on a phone](tickets/007-ui-prototype.md) — Variant C "Worker-card hub" won: home = per-worker cards with inline P/L/O marking + running total; card opens a Cycle | Settle | Details hub; tap-to-cycle calendar days; prototype kept at prototype/ui-variants.html.
- [Decision: Express or Hono for the API server?](tickets/004-express-vs-hono.md) — Hono on @hono/node-server, serving API + built Vite bundle from one port; data layer = better-sqlite3 with raw SQL and a schema.sql, no ORM.
- [Decision: shareable settlement summary — format and mechanism](tickets/008-share-format.md) — Plain English text via navigator.share (clipboard fallback): worker, cycle window, category lines, total, payment line; no image rendering.
- [Decision: backing up the SQLite data](tickets/010-backup.md) — Manual "Download backup" button only (snapshot via db.backup(), dated .sqlite download); no automatic backup in phase 1.
- [Task: assemble the build-ready spec](tickets/009-assemble-spec.md) — SPEC.md written at the repo root: rules, schema, salary function + fixtures, UI, auth (PIN details sharpened here), stack, Funnel + ntfy setup, acceptance checklist. Destination reached.

## Not yet specified

(empty — all fog resolved or graduated)

## Out of scope

- React Native Android/iOS apps and app-store deployment — phase 2, its own future map once phase 1 is live.
- Money adjustments: advances, bonuses, ad-hoc deductions. Settlement is pure attendance math.
- Maid-facing access, check-in verification, or any second user role.
