---
title: "Decision: project structure for the Expo client"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: ["011"]
---

## Question

Does the Expo client replace `src/client` in place (flat structure, same repo), or does this migration restructure the repo into a monorepo (e.g. `apps/client` + `apps/server`) to match Expo's own scaffolding conventions? Where do shared modules (`src/shared/settlement.ts`, types) live so both the Expo client and the Hono server can import them without path hacks? Depends on what [Research: how does Expo's web export integrate with a custom Hono server?](011-research-expo-web-hono.md) surfaces about Expo's expected project shape.
