---
id: 9
title: "Task: assemble the build-ready spec"
labels: [wayfinder:task]
status: closed
assignee: akhil
blocked-by: [2, 3, 4, 5, 6, 7, 8, 10]
---

## Question

Every decision is made — fold them into one document, `SPEC.md` at the repo root, that a build session can execute without asking anything. This is the map's destination.

Contents: charter rules + edge-case answers as a single rules section; the domain model, schema, and salary function spec (with worked examples usable as unit-test fixtures); screen-by-screen UI description referencing the settled prototype; stack and project layout (Vite React + chosen server + SQLite); tunnel setup and run instructions from the tunnel research; reminder mechanism from the reminder research; PIN auth (sharpen the session details from the map's "Not yet specified" while here); shareable-summary behaviour.

Resolution = SPEC.md linked here; close the map itself once this closes.

## Resolution

Assembled 2026-07-15: **[SPEC.md](../../SPEC.md)** at the repo root — domain rules, schema, computeSettlement with 4 test fixtures, Worker-card-hub UI (per the settled prototype), PIN auth (fog sharpened: scrypt hash, 180-day HttpOnly session cookie, global exponential backoff), share text, backup endpoint, Vite/React + Hono + better-sqlite3 layout with API sketch, Tailscale Funnel setup, and ntfy reminder setup, plus an acceptance checklist. This was the map's destination; the map is closed.
