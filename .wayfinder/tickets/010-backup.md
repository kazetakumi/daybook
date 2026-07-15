---
id: 10
title: "Decision: backing up the SQLite data"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

All attendance and payment history lives in one SQLite file on Akhil's laptop, which can be lost, wiped, or die. What backup does phase 1 ship with?

Consider (recommend one): a daily copy to a cloud-synced folder (OneDrive/Google Drive) via the same Windows scheduled task that sends the ntfy reminder; an export-download button in the app (manual, on-demand); or nothing for phase 1. Note the data is tiny (KBs) and the marks are exceptions-only, so even a text export is viable. Small ticket — a recommendation put to Akhil resolves it.

## Resolution

Decided with Akhil 2026-07-15: **manual export button only** for phase 1. A "Download backup" action (in a settings/about area) serves a snapshot of the database — taken via better-sqlite3's online-backup API (`db.backup()`), never a raw copy of the live file — as a dated `.sqlite` download to whichever device taps it. No scheduled/automatic backup in phase 1; the automated-daily-to-OneDrive option was offered and declined, and can be revisited in phase 2.
