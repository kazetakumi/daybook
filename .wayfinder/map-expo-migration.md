---
title: "Daybook — Expo migration plan"
labels: [wayfinder:map]
status: open
---

# Daybook — Expo migration plan

## Destination

A migration-ready plan for moving Daybook's client from Vite+React to Expo (web target, via react-native-web), continuing to run as a web app served by the existing Hono server through the Tailscale Funnel. Covers project structure, styling approach, navigation, dev/build tooling, and auth/session behavior under the new stack. Migration complete = every open decision below resolved and assembled into a plan a build session can execute without asking questions. Native iOS/Android app packaging (push notifications, EAS distribution, App Store/TestFlight) is explicit future work, not this map's destination.

## Notes

- Domain: same personal household attendance/salary app — see [CONTEXT.md](../CONTEXT.md) for vocabulary, [SPEC.md](../SPEC.md) for the current phase-1 build.
- Backend stays as-is: Hono API + better-sqlite3 (local SQLite, no hosted DB) on Akhil's Windows machine, reached via Tailscale Funnel — confirmed by [Decision: where does Daybook actually run?](tickets/017-hosting.md). Only the static-file-serving needs to adapt to whatever Expo's web export produces.
- Skills to consult: `/grilling` and `/domain-modeling` for decision tickets, `/research` for tickets needing outside knowledge (Expo / react-native-web / EAS docs).
- Standing preference: this map is pure planning, same as the closed phase-1 map ([Maid attendance & salary app — phase 1 spec](map.md)). Tickets resolve decisions; the only artifact is the migration plan. The actual code migration happens after this map, in a build session.
- Tracker: local markdown. Tickets live in `tickets/`, one file each, frontmatter `status: open|closed`, `assignee`, `blocked-by: [ids]`. A ticket is claimed by setting `assignee`. Resolution = a `## Resolution` section appended to the ticket + `status: closed` + a line added below.

## Decisions so far

- [Research: how does Expo's web export integrate with a custom Hono server?](tickets/011-research-expo-web-hono.md) — Drop-in replacement for Vite's `dist/`, zero changes to Hono's `serveStatic`; dev-time needs CORS + an absolute API URL instead of Vite's proxy (Metro has no equivalent); favicon auto-generates from `app.json`, but title/theme-color/manifest stay hand-authored in `public/index.html`.
- [Research: does the existing PIN cookie-session auth work unchanged under Expo web / react-native-web?](tickets/012-research-auth-cors.md) — No divergence in production (react-native-web has no fetch layer of its own); dev breaks not from SameSite but from the missing Vite proxy — needs either `hono/cors` + `credentials: 'include'`, or a small dev-only reverse proxy.
- [Decision: where does Daybook actually run — Windows machine vs. Oracle Cloud VPS?](tickets/017-hosting.md) — Stay on the Windows machine; Oracle's Always Free VPS was the strongest alternative but its card-for-verification requirement wasn't worth it for an app with no real uptime problem today.

## Not yet specified

- Component-by-component porting strategy (calendar grid, segmented control, day-state colors, worker-card hub) from HTML/CSS to RN primitives — sharpens once styling and navigation are decided.
- Dev workflow replacing `npm run dev`'s Vite+tsx `concurrently` setup — likely resolved as part of the Expo/Hono integration research; may spin out its own ticket if it doesn't fold in cleanly.
- TypeScript config shape (current `tsconfig.client.json` vs Expo's own conventions) — sharpens once project structure is decided.

## Out of scope

- Native iOS/Android app builds, push notifications (replacing ntfy.sh), EAS distribution, App Store/TestFlight submission — deferred to a future "native app" map once this web migration ships.
- Backend/hosting changes to a hosted platform (Vercel, Turso, or any hosted DB) — decided against during charting; local SQLite stays regardless of where it's hosted. *Where* self-hosting happens (Windows machine vs. VPS) is not out of scope — see [Decision: where does Daybook actually run?](tickets/017-hosting.md).
