---
title: "Research: does the existing PIN cookie-session auth work unchanged under Expo web / react-native-web?"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

The current auth model is a signed HttpOnly SameSite=Lax session cookie set by the Hono API, read automatically by same-origin browser fetches. Under Expo's web target (react-native-web's fetch/networking layer), served via the same Hono server on the same origin in production — does credentialed fetch (cookies) behave identically, in both production (same-origin, built bundle served by Hono) and dev (`expo start --web` on a different port than the Hono API, requiring `credentials: 'include'` and CORS)? Confirm whether any CORS configuration needs to be added to the Hono server for local dev, and whether react-native-web has any known gotchas with HttpOnly cookies or SameSite=Lax.

## Resolution

**No divergence at all** — react-native-web has no networking layer of its own (no `fetch`/`XMLHttpRequest`/`WebSocket` export; it renders via React DOM in a real browser tab), and Expo's `expo/fetch` wrapper explicitly no-ops on web (`export const fetch = globalThis.fetch;`), only overriding the native global "on Android and iOS" per the SDK docs. So **production needs no change**: same-origin Hono-served bundle, `credentials: "same-origin"` (already what `src/client/api.ts` uses), cookie behaves exactly as it does today under Vite.

**Dev does need a change, but the research corrects the ticket's premise**: it's not `SameSite=Lax` that breaks things. `localhost:8081` (Metro) and `localhost:3000` (Hono) are cross-*origin* but same-*site* (port isn't part of "site" per RFC 6265 §8.5 and the Chrome-team's same-site explainer), so `SameSite=Lax` doesn't block the cross-origin dev fetch at all — no `SameSite=None; Secure` workaround needed. The actual breakage is plainer: `apiFetch`'s existing `credentials: "same-origin"` silently drops the cookie cross-origin, and Hono sends no CORS headers today — both currently masked by Vite's `/api` dev proxy, which has **no Metro/Expo equivalent** (confirmed via an unanswered expo/expo discussion #40852). Two supported fixes, left as an implementation choice: (A) `hono/cors` on `/api/*` pinned to the literal dev origin + `credentials: true`, with the client switching to `credentials: "include"` and an absolute `EXPO_PUBLIC_API_URL` in dev; or (B) build a small dev-only reverse proxy replicating what Vite did for free, keeping dev same-origin and avoiding CORS/credentials changes entirely. Full findings, option surfaces, and sources: [expo-web-auth-cors research](../research/expo-web-auth-cors.md).
