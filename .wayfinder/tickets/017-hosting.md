---
title: "Decision: where does Daybook actually run — Windows machine vs. Oracle Cloud VPS?"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

The map's Notes currently assume the backend stays on Akhil's Windows machine, reached via Tailscale Funnel. [Research: free VPS hosting options](../research/free-vps-options.md) found Oracle Cloud Infrastructure's Always Free tier as a genuinely free, persistent-disk, always-on alternative that would let the app run without the household PC needing to stay on. [Research: free hosted database options](../research/free-hosted-db-options.md) confirms this doesn't change the data layer either way — local SQLite via `better-sqlite3` stays the right call whether self-hosting on the Windows machine or a VPS; no hosted DB is needed in either case.

Decide: does Daybook stay on the Windows machine, or move to an Oracle Cloud Always Free VPS? Consider: uptime independent of the household PC being on, setup/migration effort (provisioning the VPS, moving the SQLite file, re-pointing Tailscale Funnel or swapping to a different tunnel), Oracle's idle-instance reclamation policy as an ongoing operational habit, and whether "free forever" is worth the added infrastructure to manage versus the simplicity of the status quo.

## Resolution

**Stay on the Windows machine.** Oracle Cloud's Always Free VPS was the strongest alternative found (genuinely free forever, persistent disk, ample headroom — see [free VPS options research](../research/free-vps-options.md)), but it requires a credit card on file for identity verification at signup. Weighed against a household app with no real uptime problem today, the simplicity of the status quo (no migration effort, no new infrastructure to manage, no idle-instance-reclamation policy to watch, no card handed over) wins. The backend stays exactly where it is: Hono API + better-sqlite3 on the Windows machine, reached via Tailscale Funnel. Revisit if the household PC's uptime becomes an actual problem — the VPS research stays valid and ready to act on if so.
