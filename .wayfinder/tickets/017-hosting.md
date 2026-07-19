---
title: "Decision: where does Daybook actually run — Windows machine vs. Oracle Cloud VPS?"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

The map's Notes currently assume the backend stays on Akhil's Windows machine, reached via Tailscale Funnel. [Research: free VPS hosting options](../research/free-vps-options.md) found Oracle Cloud Infrastructure's Always Free tier as a genuinely free, persistent-disk, always-on alternative that would let the app run without the household PC needing to stay on. [Research: free hosted database options](../research/free-hosted-db-options.md) confirms this doesn't change the data layer either way — local SQLite via `better-sqlite3` stays the right call whether self-hosting on the Windows machine or a VPS; no hosted DB is needed in either case.

Decide: does Daybook stay on the Windows machine, or move to an Oracle Cloud Always Free VPS? Consider: uptime independent of the household PC being on, setup/migration effort (provisioning the VPS, moving the SQLite file, re-pointing Tailscale Funnel or swapping to a different tunnel), Oracle's idle-instance reclamation policy as an ongoing operational habit, and whether "free forever" is worth the added infrastructure to manage versus the simplicity of the status quo.
