---
id: 2
title: "Research: is localtunnel viable for exposing the app to family phones?"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

The app runs on Akhil's machine and family phones reach it through a public tunnel. Is localtunnel (`lt`) actually viable for this, and if not, what should replace it?

Resolve specifically:

- localtunnel's interstitial "tunnel password / enter your public IP" page — does it appear for phone browsers hitting the app, how often, and can it be bypassed or disabled? Does it break a PWA/home-screen-app experience?
- Stable subdomain support (`--subdomain`): how reliably is the same subdomain retained across restarts? A changing origin would break bookmarks, the session cookie, and any Web Push subscription (see ticket 3's interplay).
- Reliability/uptime reputation of the free localtunnel service in 2025–26.
- Alternatives if lt is too janky, compared on: free tier, stable HTTPS origin, no interstitial, setup effort on Windows — Cloudflare Tunnel (quick + named), ngrok free, Tailscale Funnel, or others found.

Output: a recommendation (keep lt or switch to X) with concrete setup steps for the chosen option on Windows 11.

## Resolution

localtunnel is not viable: since May 2023 its interstitial requires visitors to type the host's public IP as a password, which normal phone browsers/PWAs cannot bypass (header-only bypass), `--subdomain` is frequently lost across restarts (breaking the session cookie and any Web Push subscriptions), and the free server's 2025–26 reliability is poor. ngrok free has the same interstitial problem plus 1 GB / 20k-requests monthly caps; a Cloudflare quick tunnel changes its URL every run; a named Cloudflare Tunnel is excellent but requires owning a domain. **Recommendation: switch to Tailscale Funnel** — free, no interstitial, stable public HTTPS origin `https://<machine>.<tailnet>.ts.net`, and `tailscale funnel --bg 3000` persists across reboots on Windows 11. Full comparison, sources, and step-by-step Windows setup: [tunnel-options research](../research/tunnel-options.md). Spec note: treat the public origin as config (Web Push/VAPID) and don't rename the Tailscale machine.
