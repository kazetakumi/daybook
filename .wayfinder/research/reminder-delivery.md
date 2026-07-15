# Research: how should the daily marking reminder reach the family's phones?

Ticket: [003](../tickets/003-research-reminder.md) · Researched 2026-07-15 against primary sources (MDN, WebKit, ntfy.sh docs, Telegram Bot API docs).

## TL;DR

Don't build Web Push for phase 1. Use **ntfy.sh**: family installs the ntfy app and subscribes to one secret topic; a Windows Task Scheduler job on the host `curl`s a reminder to that topic. And because unmarked days default to Present, make the reminder **settlement-eve (+ optional weekly)**, not daily. Fallback: a **Telegram bot** posting to a family group on the same schedule.

---

## 1. Web Push from the PWA

### Requirements

- **Service worker, active, per origin.** "For an app to receive push messages, it has to have an active service worker" ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). Service workers require HTTPS: "Service workers are restricted to running across HTTPS for security reasons… `localhost` is considered a secure origin" ([MDN, Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)).
- **VAPID application server keys.** The server generates a keypair; the public key is passed to `PushManager.subscribe()` as `applicationServerKey`, and the private key signs every push request to the push service ([web.dev, Push notifications overview](https://web.dev/articles/push-notifications-overview)).
- **Server-side plumbing.** The app must store each phone's subscription (a secret capability URL — "Each subscription is unique to a service worker. The endpoint for the subscription is a unique capability URL" — MDN), and send through it with a library like `web-push`, handling expiry/410s.

### Does a tunnel origin qualify?

Yes. Cloudflare Tunnel / ngrok / localtunnel all terminate TLS with a valid certificate for their public hostname, so the browser sees an ordinary HTTPS secure context. Nothing about tunneling disqualifies push — **stability** of the origin is the issue, not its legitimacy.

### Real-world reliability

- **Android Chrome:** solid. Push rides Google's FCM push service; works from the browser tab or an installed PWA, notifications shown even with the site closed. Main caveat is aggressive OEM battery managers delaying background delivery — minor for a once-a-day nudge.
- **iOS Safari:** works only since **iOS/iPadOS 16.4**, and **only for web apps added to the Home Screen** — "Web Push only functions for web apps added to the Home Screen, not for websites accessed through Safari," and the permission request must be "in response to direct user interaction" ([WebKit blog: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Delivery goes through APNs like native apps. Practical gotchas: every family iPhone must do the add-to-home-screen ritual; deleting the icon silently kills the subscription; the app only learns via a failed push later.

### Interplay with a changing tunnel origin (ticket 2)

This is the killer. Service worker registrations, the Notification permission grant, and push subscriptions are all **scoped to the origin**. If the tunnel hostname changes (localtunnel's free `--subdomain` is not guaranteed across restarts — ticket 2):

- the new origin has no service worker, no permission, no subscriptions — every phone must revisit, re-grant, re-subscribe;
- on iOS the home-screen icon still points at the dead origin, so the ritual repeats from scratch;
- stored subscriptions still technically deliver (endpoints live on FCM/APNs, not on your origin), but notification clicks open a dead URL and no new subscriptions can be minted.

**Web Push is only sane once ticket 2 lands a stable origin** (e.g. Cloudflare named tunnel). Even then it's the highest-effort option here: VAPID keys, subscription table, send/expiry handling, per-phone onboarding, iOS home-screen requirement.

## 2. Out-of-band alternatives

| Option | Moving parts | Effort | Reliability |
|---|---|---|---|
| **ntfy.sh** | Family installs ntfy app, subscribes to secret topic; host curls it | ~15 min, no accounts | Android excellent; iOS good with known quirks |
| **Telegram bot** | BotFather bot, family group, host curls `sendMessage` | ~30 min | Excellent (Telegram's own push) |
| **Email (scheduled)** | SMTP creds (e.g. Gmail app password), script on host | ~1 hr | Delivery fine; poor as a *nudge* (buried, often silent) |
| **Windows scheduled task** | Not a channel — the trigger that fires any of the above | ~10 min | See laptop caveat below |

- **ntfy.sh** — publishing is one HTTP call, no account: `curl -d "Mark attendance" ntfy.sh/<topic>` ([ntfy publish docs](https://docs.ntfy.sh/publish/)). "The topic is essentially a password, so pick something that's not easily guessable" (same page) — fine for a household with a random topic like `kaze-maid-x7Qp29`. Supports scheduled delivery up to 3 days ahead via the `At:`/`In:` header. Known issues: the iOS app has delivery quirks (view not refreshing until pulled; occasional Firebase/APNs hiccups fixed by re-adding the topic) ([ntfy known issues](https://docs.ntfy.sh/known-issues/)); Android is rock-solid. Completely decoupled from the tunnel origin.
- **Telegram bot** — create a bot via [@BotFather](https://core.telegram.org/bots), add it to a family group (a user/group must initiate contact with the bot first), then the host calls `sendMessage` with the bot token and chat id ([Bot API](https://core.telegram.org/bots/api#sendmessage)). Rate limits are irrelevant at this scale (~30 msg/s free ceiling, [Bots FAQ](https://core.telegram.org/bots/faq)). Requires the family to actually use Telegram; if they already do, this is arguably the most reliable channel of all.
- **Email** — works everywhere but is the weakest *reminder*: mail apps batch-fetch, notify silently or not at all, and a daily identical mail trains everyone to ignore it. More setup (SMTP credentials) for a worse nudge. Not recommended.
- **Windows Task Scheduler on the host** — the natural trigger: a daily/weekly `schtasks` job running the curl. Laptop caveat: if the machine is asleep/off at trigger time the send is skipped unless "Run task as soon as possible after a scheduled start is missed" is enabled (and even then it fires at next boot, maybe at an odd hour). Mitigations: enable wake timers, or have the app itself pre-schedule the next reminder via ntfy's `At:` header (up to 3 days ahead) so ntfy's server does the timing even if the laptop sleeps. Simplest v1: scheduled task + missed-start catch-up; it only has to succeed once per week (see below).

## 3. Does "default Present" change the cadence? Yes.

Unmarked days cost nothing — they settle as Present automatically (charter, ticket 1). The failure mode is not "forgot to open the app today"; it is "an Absent/employer-off day went unrecorded and the settlement overpays." So:

- A **daily** reminder is mostly noise and gets swiped away within a week — it actively erodes attention for the message that matters.
- The high-value nudge is **settlement-eve**: the day before the cycle closes, "Review this cycle before payday — any absences or off-days not marked?" That is the last moment a missed exception is cheaply fixable.
- An optional **weekly** nudge ("any exceptions this week?") bounds memory decay to 7 days for households that won't reliably remember mid-cycle absences.

This also lowers the reliability bar: the mechanism needs to land ~1–5 messages a month, not 30, which makes the scheduled-task-on-a-laptop approach entirely adequate.

## 4. Recommendation

**Primary: ntfy.sh, settlement-eve + optional weekly cadence.** Moving parts:

1. One secret topic name (random suffix) shared with the family.
2. Each phone installs the ntfy app (Play Store / App Store) and subscribes to the topic — one-time, ~2 min per phone.
3. A Windows Task Scheduler job on the host (weekly, plus one aligned to the configurable cycle-end date — trivially computed by a small script that asks the app's own API/DB when the cycle ends) runs `curl -d "..." ntfy.sh/<topic>`, with "run when missed" enabled.
4. Optionally the app pre-schedules the settlement-eve message via ntfy's `At:` header so it fires even if the laptop is asleep.

Why: zero accounts, zero app-side code, immune to tunnel-origin churn (works regardless of what ticket 2 decides), and each reminder can deep-link the current tunnel URL in its body.

**Fallback: Telegram bot into a family group** — same scheduled-task trigger, one `sendMessage` curl. Choose it instead if the family already lives in Telegram or the ntfy iOS app proves flaky.

**Explicitly deferred: Web Push.** Revisit only after ticket 2 yields a permanently stable HTTPS origin *and* phase 1 is live; even then it adds VAPID + subscription storage + per-phone onboarding + the iOS home-screen requirement for a nudge that out-of-band channels deliver for free.

## Sources

- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN — Using Service Workers (HTTPS requirement)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [web.dev — Push notifications overview (VAPID, endpoints, TTL)](https://web.dev/articles/push-notifications-overview)
- [WebKit blog — Web Push for Web Apps on iOS and iPadOS (16.4, home-screen requirement)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [ntfy.sh — Publishing (curl, `At:` scheduling, topic-as-password)](https://docs.ntfy.sh/publish/)
- [ntfy.sh — Known issues (iOS delivery quirks)](https://docs.ntfy.sh/known-issues/)
- [Telegram — Bot API `sendMessage`](https://core.telegram.org/bots/api#sendmessage) · [Bots intro/BotFather](https://core.telegram.org/bots) · [Bots FAQ (rate limits)](https://core.telegram.org/bots/faq)
