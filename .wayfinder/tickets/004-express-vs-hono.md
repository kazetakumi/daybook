---
id: 4
title: "Decision: Express or Hono for the API server?"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

The stack is Vite React + a separate Node API server with SQLite. Express or Hono?

Small decision — resolve with a short recommendation put to Akhil. Consider: familiarity (ask), TypeScript ergonomics, serving the built Vite bundle from the same process (one port to tunnel), and whether the choice matters at all at this scale. Include which SQLite binding/ORM pairs naturally (better-sqlite3 raw vs Drizzle).

## Resolution

Decided with Akhil 2026-07-15: **Hono** (via `@hono/node-server`), serving both the API and the built Vite bundle (`serve-static`) from one process/port — the single port is what the tunnel exposes. Data layer: **better-sqlite3 with raw SQL** and a `schema.sql`; no ORM — six tiny tables don't earn one, and the salary calculation is a pure TypeScript function independent of the data layer. Chosen for TS-first ergonomics at this scale; Express rejected only on ergonomics, not capability.
