---
title: "Decision: styling approach for rebuilding the UI in React Native primitives"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

The current UI (Worker-card hub, calendar grid, segmented control, day-state colors, light/dark themes — SPEC.md §4, `prototype/ui-variants.html` Variant C) is plain CSS. React Native has no CSS; every component gets rebuilt on `View`/`Text`/`Pressable` primitives. What's the styling approach — plain `StyleSheet.create`, NativeWind (Tailwind for RN), or another library (e.g. Tamagui, styled-components) — balancing the web-only target today against not painting the future native app into a corner?
