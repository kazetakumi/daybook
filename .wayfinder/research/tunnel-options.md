# Research: tunnel options for exposing Daybook to family phones

Ticket: [002-research-tunnel](../tickets/002-research-tunnel.md) · Researched 2026-07-15

## TL;DR

**Drop localtunnel. Use Tailscale Funnel** as the tunnel for phase 1: free, stable HTTPS origin (`<machine>.<tailnet>.ts.net`), no interstitial, survives restarts, ~10 minutes of setup on Windows 11. If Akhil ever owns a domain on Cloudflare, a **named Cloudflare Tunnel** is the even-more-robust upgrade path; everything else on the free market either shows an interstitial (localtunnel, ngrok free) or changes its URL on every restart (Cloudflare *quick* tunnel).

---

## 1. localtunnel's interstitial page

Since **May 2023** the public localtunnel server puts a consent page in front of every tunnel, and it is no longer click-through: **visitors must type a password, which is the tunnel creator's public IP address** ([issue #598](https://github.com/localtunnel/localtunnel/issues/598)). The maintainer added it as an anti-phishing measure and explicitly suggested users whose needs it breaks "use ngrok" instead.

Behavior relevant to this app:

- **Appears per visitor IP, roughly once every 7 days** ([issue #407](https://github.com/localtunnel/localtunnel/issues/407)). Phones hop IPs constantly (mobile data ↔ home Wi-Fi, CGNAT rotation), so in practice family phones would see it far more often than weekly.
- **The password is the *host machine's* public IP** — family members on mobile data have no way to know it without Akhil messaging it to them, and it changes whenever the home connection's IP changes. Retrievable only from the host side via `https://loca.lt/mytunnelpassword`.
- **Bypass exists only via request headers** — a `Bypass-Tunnel-Reminder` header or a non-standard `User-Agent` ([issue #666/#663 docs discussion](https://github.com/localtunnel/localtunnel/issues/663), [#672](https://github.com/localtunnel/localtunnel/issues/672)). A normal phone browser or an installed PWA **cannot set custom headers on navigations**, so this is unusable for family members. A request to bypass via URL parameter is open and unanswered ([issue #727](https://github.com/localtunnel/localtunnel/issues/727)), as is a request to disable the password entirely ([issue #702](https://github.com/localtunnel/localtunnel/issues/702), Feb 2025, no maintainer response).
- **PWA impact:** a home-screen-installed app that opens to an IP-password prompt is effectively broken for non-technical family. Service-worker navigations would also intermittently receive the interstitial HTML instead of the app.

**Verdict on this bullet alone: disqualifying** for a family-facing app.

## 2. `--subdomain` stability across restarts

Long-standing, still-open problem: when the client exits (Ctrl+C, crash, laptop sleep) the server does not promptly release the name, and **relaunching with the same `--subdomain` gets you a random name instead** ([issue #248](https://github.com/localtunnel/localtunnel/issues/248), [#220](https://github.com/localtunnel/localtunnel/issues/220), [#556](https://github.com/localtunnel/localtunnel/issues/556), [#641](https://github.com/localtunnel/localtunnel/issues/641)). Names are also first-come-first-served globally, so someone else can hold the subdomain.

Why origin stability matters for this app specifically:

- **Session cookie** — the family-PIN session cookie is scoped to the origin. New origin = everyone re-enters the PIN, and bookmarks/home-screen icons dangle.
- **Web Push subscriptions** (ticket 3 interplay) — a `PushSubscription` is bound to the service worker registration, which is bound to the origin. A changed origin **silently invalidates every phone's push subscription**; each device must revisit and re-subscribe. An origin that changes on every laptop reboot makes push effectively unusable.

## 3. localtunnel free-service reliability, 2025–26

Poor and acknowledged as such. The public server suffers recurring overload and 503s; the maintainer has been fighting DOS-like subdomain-request spam, swapped nginx for haproxy, and added a 2000 req/min per-subdomain rate limit ([issue #695](https://github.com/localtunnel/localtunnel/issues/695), [status page](https://status.loca.lt/), [issue #697](https://github.com/localtunnel/localtunnel/issues/697)). Third-party writeups treat recurring 503s as expected and recommend moving off it for anything depending on a stable URL ([localxpose blog on lt 503s](https://localxpose.io/blog/localtunnel-503-tunnel-unavailable)). The npm client's last release is years old; the service is one volunteer's free infrastructure. Fine for a 20-minute demo, not for a household app family relies on daily.

## 4. Alternatives compared

| Option | Free tier | Stable HTTPS origin | Interstitial | Windows setup effort | Catches |
|---|---|---|---|---|---|
| **localtunnel** | Yes | No — `--subdomain` unreliable across restarts | **Yes — IP-password page**, undisablable | Trivial (`npx localtunnel`) | Reliability poor; interstitial breaks family/PWA use |
| **Cloudflare quick tunnel** (`cloudflared tunnel --url`) | Yes, no account | **No — random `*.trycloudflare.com` per run** | No | Trivial | No SLA; URL churn breaks cookie + push |
| **Cloudflare named tunnel** | Yes (free plan) | **Yes — your own hostname** | No | Moderate: account + **requires a domain you own on Cloudflare**; then `cloudflared` as a Windows service | Domain costs ~US$10/yr if not already owned; otherwise best-in-class ([setup docs](https://developers.cloudflare.com/tunnel/setup/), [Windows service docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/windows/)) |
| **ngrok free** | Yes | Yes — one assigned static `*.ngrok-free.app` dev domain | **Yes — "Visit site" page**, 7-day cookie per device; removable only on paid plans | Easy (installer + authtoken) | Also 1 GB & **20,000 requests/month** caps ([free plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits), [interstitial docs](https://ngrok.com/blog/free-static-domains-ngrok-users)) |
| **Tailscale Funnel** | Yes (Personal plan, 3 users/100 devices) | **Yes — `machine.tailnet.ts.net`**, stable for the life of the node | **No** | Easy: install Tailscale, enable HTTPS + Funnel, one CLI command; config persists across reboots | Only ports 443/8443/10000 (irrelevant — it proxies to any local port); undisclosed bandwidth limit, ample for this app ([Funnel docs](https://tailscale.com/docs/features/tailscale-funnel), [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/funnel)) |

Notes:

- Visitors to a Funnel URL do **not** need Tailscale — it is a genuinely public URL; relay servers hide the home IP ([Funnel blog](https://tailscale.com/blog/introducing-tailscale-funnel)).
- ngrok's interstitial is bypassable only with a `ngrok-skip-browser-warning` header — same phone-browser problem as localtunnel, so ngrok free fails the same criterion.
- Self-hosting a localtunnel server or renting a VPS + Caddy would also work but is over-engineering for one household.

## 5. Recommendation

**Switch to Tailscale Funnel.** It is the only zero-cost option that satisfies all four criteria (free, stable origin, no interstitial, low Windows effort) without requiring the purchase of a domain. The stable `https://<machine>.<tailnet>.ts.net` origin keeps the PIN session cookie, home-screen bookmarks, and future Web Push subscriptions valid indefinitely. Record the upgrade path: if a personal domain is ever acquired, migrate to a named Cloudflare Tunnel (no third-party hostname, runs as a native Windows service, effectively no limits).

### Windows 11 setup steps (Tailscale Funnel)

1. Install Tailscale for Windows from https://tailscale.com/download (or `winget install Tailscale.Tailscale`) and sign in (Google/GitHub/etc. creates a free Personal tailnet).
2. In the [admin console](https://login.tailscale.com/admin/dns), under **DNS**: enable **MagicDNS** and **HTTPS Certificates**.
3. First `funnel` invocation prompts to enable the Funnel node attribute in the tailnet policy (one click on the printed admin URL), or add it manually under Access Controls.
4. With the app listening locally (say port 3000), run in an elevated/normal terminal:
   `tailscale funnel --bg 3000`
   `--bg` persists the config in the Tailscale service, so the funnel comes back automatically after reboots as long as Tailscale (a Windows service, auto-start) is running — no extra Task Scheduler work.
5. Note the printed URL, e.g. `https://<machine-name>.<tailnet-name>.ts.net/` — share it once with family; they bookmark / "Add to Home screen".
6. Verify from a phone on mobile data. `tailscale funnel status` shows the active config; `tailscale funnel --bg off` (or `reset`) tears it down.

Spec implications: the app should treat its public origin as a config value (for Web Push VAPID and any absolute URLs), and the machine name should be chosen once and not renamed, since renaming the node changes the hostname.

## Sources

- localtunnel issues: [#598 password page](https://github.com/localtunnel/localtunnel/issues/598) · [#702 disable request](https://github.com/localtunnel/localtunnel/issues/702) · [#727 URL-param bypass request](https://github.com/localtunnel/localtunnel/issues/727) · [#672](https://github.com/localtunnel/localtunnel/issues/672) / [#663 header bypass](https://github.com/localtunnel/localtunnel/issues/663) · [#407 7-day reminder](https://github.com/localtunnel/localtunnel/issues/407) · subdomain loss: [#248](https://github.com/localtunnel/localtunnel/issues/248), [#220](https://github.com/localtunnel/localtunnel/issues/220), [#556](https://github.com/localtunnel/localtunnel/issues/556), [#641](https://github.com/localtunnel/localtunnel/issues/641) · reliability: [#695](https://github.com/localtunnel/localtunnel/issues/695), [#697](https://github.com/localtunnel/localtunnel/issues/697), [status.loca.lt](https://status.loca.lt/)
- Cloudflare: [Tunnel setup](https://developers.cloudflare.com/tunnel/setup/) · [create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/) · [run as Windows service](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/windows/)
- ngrok: [free plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits) · [static dev domains announcement](https://ngrok.com/blog/free-static-domains-ngrok-users)
- Tailscale: [Funnel docs](https://tailscale.com/docs/features/tailscale-funnel) · [funnel CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel) · [Funnel examples](https://tailscale.com/docs/reference/examples/funnel) · [intro blog](https://tailscale.com/blog/introducing-tailscale-funnel)
