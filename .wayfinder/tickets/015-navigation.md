---
title: "Decision: navigation approach for the Expo client"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

The current app has no router — Home → Worker hub is plain React state, and the Worker hub's Cycle | Settle | Details is a segmented control over state, not routes. Does the Expo migration adopt `expo-router` (file-based routing, URL-addressable screens — useful for a web target) or keep the current manual state-based navigation? Consider deep-linking value on web (e.g. sharing a link to a specific worker's Settle view) versus the added structure of file-based routes for a 3-screen app.
