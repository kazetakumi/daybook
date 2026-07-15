---
id: 3
title: "Research: how should the daily marking reminder reach the family's phones?"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

Phase 1 includes a daily reminder to mark attendance. The app is a locally-hosted web app behind a tunnel — what's the simplest reliable way to get a daily notification onto Android/iOS phones?

Resolve specifically:

- Web Push from a PWA: requirements (service worker, VAPID, HTTPS origin — a tunnel origin qualifies?), and real-world reliability on Android Chrome and iOS Safari (iOS needs the app added to home screen — which iOS versions, what breaks). How badly does a *changing* tunnel origin break push subscriptions (interplay with ticket 2)?
- Simpler out-of-band alternatives, each with effort/reliability: ntfy.sh (family installs the ntfy app, server curls a topic daily), a Telegram bot message, plain email via cron, or a scheduled task on the host machine.
- Whether "default Present" (only exceptions need marking) changes the recommendation — maybe a weekly nudge or a settlement-day-only reminder suffices.

Output: a recommended mechanism with its moving parts listed, plus a fallback.

## Resolution

Recommended: **ntfy.sh out-of-band, not Web Push** — family phones install the ntfy app and subscribe to one secret topic; a Windows Task Scheduler job on the host curls the topic. Because unmarked days default to Present, the cadence is **settlement-eve plus an optional weekly nudge**, not daily — the only costly failure is an unrecorded exception at payday. Fallback: a Telegram bot posting to a family group via the same scheduled curl. Web Push is deferred: it needs a service worker + VAPID + subscription storage, iOS requires 16.4+ with the app added to the home screen, and — decisively — subscriptions/permissions are per-origin, so a changing tunnel origin (ticket 2) forces every phone to re-onboard.

Full findings with sources: [reminder-delivery.md](../research/reminder-delivery.md)
