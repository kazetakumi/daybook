---
title: "Decision: styling approach for rebuilding the UI in React Native primitives"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

The current UI (Worker-card hub, calendar grid, segmented control, day-state colors, light/dark themes — SPEC.md §4, `prototype/ui-variants.html` Variant C) is plain CSS. React Native has no CSS; every component gets rebuilt on `View`/`Text`/`Pressable` primitives. What's the styling approach — plain `StyleSheet.create`, NativeWind (Tailwind for RN), or another library (e.g. Tamagui, styled-components) — balancing the web-only target today against not painting the future native app into a corner?

## Resolution

**NativeWind** (Tailwind for React Native). Chosen over plain `StyleSheet.create` and over heavier design-system tooling (Tamagui, styled-components) as the right middle ground: utility-class authoring, and it's built for exactly this app's shape — universal styling across React Native *and* web via react-native-web, which is this migration's actual target today.

Implementation notes for the assemble-plan ticket:
- NativeWind supports CSS custom properties and a `dark:` variant natively — the existing token set in `src/client/index.css` (`--bg`, `--card`, `--ink`, `--present`/`--leave`/`--off` + their `-soft` variants, `--accent`, `--warn`, `--shadow`, etc.) maps onto a `tailwind.config.js` theme extension rather than being thrown away; today's dual light/dark mechanism (`prefers-color-scheme` media query + an explicit `data-theme` override) has a direct NativeWind equivalent worth confirming against NativeWind's current dark-mode docs when the config is written.
- Current CSS is a small, well-organized surface (~7 screens, a handful of reusable classes like `.card`/`.btn-primary`/`.kv-row`) — this is a bounded rewrite, not a redesign; SPEC.md §4 and `prototype/ui-variants.html` Variant C remain the visual reference.
- Adds real tooling to the project: Tailwind config, NativeWind's Metro/babel plugin — the project-structure ticket should account for where this config lives.
