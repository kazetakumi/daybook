# 08 — Backup download

**What to build:** The manual backup from SPEC.md §8. Settings gains a "Download backup" action that downloads a snapshot of the database as `daybook-YYYY-MM-DD.sqlite`. The server endpoint is authenticated and produces the snapshot with better-sqlite3's online backup API (`db.backup()`) — never a raw copy of the live file — so it is valid even while the app is being used.

**Blocked by:** 03 — PIN auth (Settings screen + route gating).

**Status:** ready-for-agent

- [ ] Download from Settings yields a dated .sqlite file that opens as a valid SQLite database containing the six tables and current data
- [ ] Snapshot taken via the online backup API while the app is live (verify with concurrent writes)
- [ ] Endpoint returns 401 without a valid session
