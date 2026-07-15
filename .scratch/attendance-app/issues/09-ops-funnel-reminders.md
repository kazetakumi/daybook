# 09 — Ops: expose via Tailscale Funnel + ntfy reminders

**What to build:** The app reachable from family phones on mobile data, and reminder pings landing on those phones — per SPEC.md §9–10 (full research under .wayfinder/research/). This ticket is partly human-in-the-loop: sign-ins and phone installs need Akhil; the agent prepares scripts and precise instructions.

- Tailscale Funnel on the Windows host: install, enable MagicDNS + HTTPS certs, `tailscale funnel --bg 3000`, record the stable `https://<machine>.<tailnet>.ts.net` URL (don't rename the machine). Set `PUBLIC_ORIGIN` accordingly.
- ntfy: choose one secret topic; write a short family-onboarding note (install ntfy app, subscribe; bookmark/Add to Home Screen the Funnel URL).
- Windows Task Scheduler jobs with "run when missed": a weekly nudge, and a settlement-eve ping (a small script determines the next cycle end from the app/DB) — each curling the topic with a message that includes the app URL. Not daily (unmarked days are Present).

**Blocked by:** 05 — Marking days; 06 — Settle pane (a usable app is what's being exposed).

**Status:** ready-for-agent

- [ ] App loads and is fully usable from a phone on mobile data via the Funnel URL; origin survives a host reboot
- [ ] Test ntfy ping lands on at least one subscribed phone
- [ ] Scheduled tasks exist, run when missed, and the settlement-eve job targets the day before the earliest upcoming cycle end
- [ ] Family onboarding note written (Funnel URL, PIN sharing, ntfy subscribe steps)
