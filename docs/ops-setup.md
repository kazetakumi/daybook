# Daybook — ops setup: Tailscale Funnel + ntfy reminders

This is a **you-do-this, not the agent** checklist (SPEC.md §9–§10). It covers
three things, in order:

1. Exposing the app to family phones over the internet via **Tailscale
   Funnel**, with a stable HTTPS URL.
2. Setting up **ntfy.sh** push reminders on family phones.
3. Registering the two Windows **Task Scheduler** jobs that send those
   reminders automatically.

Do these in order — the Task Scheduler jobs in Part 3 need the Funnel URL
from Part 1 and the ntfy topic from Part 2.

Everything referenced from `scripts/` is already written and tested; this
document just tells you which commands to run and in what order. Nothing
here has been run for you — no software has been installed, no accounts
created, no scheduled tasks registered.

---

## Part 0 — before you start: run the production build, not `npm run dev`

Tailscale Funnel forwards `https://<your-url>` straight to `localhost:3000`.
In `npm run dev`, the Hono server on port 3000 only answers `/api/*` — the
actual UI is served separately by Vite on its own dev port and won't be
reachable through the Funnel. Family phones need the **built** app served
from port 3000.

From the project root (`D:\kaze\POCs\attendence`):

```powershell
npm run build
npm start
```

Leave that `npm start` window open — the server has to keep running for the
Funnel (and family) to reach it. This setup doesn't include making the
server auto-start or run as a background service; for now, plan to leave
that terminal window running, and re-run `npm start` after any reboot or
crash. `tailscale funnel --bg` itself survives a reboot (Part 1.4) — it's
only "nothing answers on port 3000 yet" that a reboot can cause, until you
re-run `npm start`.

If manually restarting `npm start` after every reboot gets old, you can
register your own Task Scheduler job that runs `npm start` in the project
directory at logon (`New-ScheduledTaskTrigger -AtLogOn`, same pattern as
`scripts/register-scheduled-tasks.ps1` uses for the reminders) — not
included here since it's a separate concern from Funnel/ntfy, but the same
`ScheduledTasks` module covers it.

Confirm it works locally first: open `http://localhost:3000` in a browser on
the same machine and check the PIN screen loads.

---

## Part 1 — Tailscale Funnel

### 1.1 Install

```powershell
winget install Tailscale.Tailscale
```

Follow the installer prompts (default options are fine).

### 1.2 Sign in

Launch Tailscale from the Start menu (or it may open automatically after
install). Sign in with Google, GitHub, Microsoft, or email — any of these
creates a free **Personal** tailnet, which is all this needs. This machine
is now a node on your tailnet.

### 1.3 Admin console: enable MagicDNS + HTTPS Certificates

1. Go to the [Tailscale admin console → DNS](https://login.tailscale.com/admin/dns).
2. Under **MagicDNS**, click **Enable MagicDNS** if it isn't already on.
3. Under **HTTPS Certificates**, click **Enable HTTPS** if it isn't already
   on. (This is what lets Tailscale mint a real trusted cert for
   `<machine>.<tailnet>.ts.net` — without it, Funnel can't serve HTTPS.)

### 1.4 Start the Funnel

In a PowerShell window (does not need to be elevated/Administrator):

```powershell
tailscale funnel --bg 3000
```

**First time only:** this may print a message saying Funnel isn't yet
enabled for your tailnet, with a one-click URL like
`https://login.tailscale.com/f/funnel?node=...`. Open that URL in a
browser, click to enable it, then re-run the same `tailscale funnel --bg
3000` command.

`--bg` backgrounds the funnel config inside the Tailscale Windows service
(which auto-starts with Windows), so **the Funnel itself survives
reboots** without you doing anything else — you do not need a scheduled
task to re-run this command. (You do still need `npm start` running for
there to be anything listening on port 3000 for it to forward to — see
Part 0.)

### 1.5 Record the URL and verify

The command prints the public URL, something like:

```
https://<machine-name>.<tailnet-name>.ts.net
```

Write this down — you'll need it in Part 1.6, Part 2, and Part 3.

Check status any time with:

```powershell
tailscale funnel status
```

Verify from a phone: turn off Wi-Fi (use mobile data) and open the URL in a
browser. You should see the Daybook PIN screen.

### 1.6 Set `PUBLIC_ORIGIN` and restart the server

The server reads `PUBLIC_ORIGIN` from the environment (`src/server/index.ts`,
falls back to `http://localhost:<port>` if unset — fine for local dev, not
for the Funnel URL). Set it as a persistent **user** environment variable:

```powershell
setx PUBLIC_ORIGIN "https://<machine-name>.<tailnet-name>.ts.net"
```

`setx` only takes effect in **new** PowerShell windows/processes — it will
not affect the `npm start` you already have running. Close that terminal,
open a fresh PowerShell window (to pick up the new environment variable),
`cd` back to the project, and run `npm start` again:

```powershell
npm start
```

(`PORT` defaults to 3000 already, matching what `tailscale funnel --bg 3000`
forwards to — no need to set it unless you want a different port, in which
case set `PORT` the same way and re-run `tailscale funnel --bg <port>` to
match.)

### 1.7 Don't rename the machine

Renaming the Tailscale node changes `<machine-name>` in the URL, which
breaks: the Funnel URL you shared with family, everyone's bookmarks /
home-screen icons, the `PUBLIC_ORIGIN` you just set, and (once sessions
exist) the PIN-login session cookie's scope. If you ever do need to rename
it, repeat steps 1.5–1.6 with the new URL and re-share it with everyone.

---

## Part 2 — ntfy reminders

### 2.1 Pick a secret topic name

ntfy topics are unauthenticated by default — anyone who knows (or guesses)
the exact topic name can publish to it or read it, so **the topic name is
effectively a shared password**. Don't use a guessable name.

Pick something like `daybook-` followed by a random string only you
generate (don't reuse an example from this doc or from SPEC.md — those are
illustrative, not something to actually use). A quick way to generate one:

```powershell
-join ((48..57) + (97..122) | Get-Random -Count 8 | ForEach-Object { [char]$_ })
```

Run that, prefix the output with `daybook-`, and that's your topic — e.g. if
it prints `k3j9x2p7` your topic is `daybook-k3j9x2p7`. Write it down; you'll
need it for every phone and for Part 3.

### 2.2 Install the ntfy app on each family phone

- Android: [ntfy on Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- iOS: [ntfy on the App Store](https://apps.apple.com/us/app/ntfy/id1625396347)

### 2.3 Subscribe each phone to the topic

In the ntfy app: **+ (Subscribe to topic)** → enter your exact topic name
(e.g. `daybook-k3j9x2p7`) → **Subscribe**. That's it — no account, no login.
Do this once per phone.

### 2.4 Send a test notification

From the host machine (or anywhere with `curl`), after Part 2.1–2.3 are
done:

```powershell
curl.exe -d "Test: Daybook reminders are working" "https://ntfy.sh/daybook-k3j9x2p7"
```

(substitute your real topic). Confirm it lands on every subscribed phone
before moving on — this is also the acceptance check for this ticket
("test ntfy ping lands on at least one subscribed phone").

### 2.5 Bookmark / add the Funnel URL to each phone's home screen

Open the Funnel URL (Part 1.5) in the phone's browser, log in with the
shared PIN, then:

- **Android Chrome:** menu (⋮) → **Add to Home screen**.
- **iOS Safari:** Share icon → **Add to Home Screen**.

---

## Part 3 — Windows Task Scheduler reminder jobs

Three files under `scripts/` implement this (all already written — nothing
below asks you to write code, only to read and run it):

| File | Role |
|---|---|
| `scripts/next-cycle-end.ts` | Read-only check: does any active worker's Cycle end tomorrow? Reuses the app's own `cycleWindows()` from `src/shared/settlement.ts` against `data/daybook.sqlite`. |
| `scripts/send-weekly-nudge.ps1` | Posts one ntfy message. Run weekly, unconditionally. |
| `scripts/send-settlement-eve-ping.ps1` | Runs `next-cycle-end.ts --check` first; only posts to ntfy if it says a Cycle ends tomorrow. Run daily; no-ops most days. |
| `scripts/register-scheduled-tasks.ps1` | Registers the two Task Scheduler jobs that call the scripts above on a schedule. **This is the one you run.** |

### 3.1 Read the scripts first

Open `scripts/register-scheduled-tasks.ps1`, `scripts/send-weekly-nudge.ps1`,
and `scripts/send-settlement-eve-ping.ps1` and read through them — they're
short and commented. None of them hardcode your ntfy topic; you supply it as
a parameter when you run the registration script.

### 3.2 Preview, then register

Open PowerShell in the project root. If running local scripts is blocked by
execution policy, allow it for just this process:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Preview what would be registered, without changing anything (`-WhatIf`):

```powershell
.\scripts\register-scheduled-tasks.ps1 `
  -NtfyTopic "daybook-k3j9x2p7" `
  -AppUrl "https://<machine-name>.<tailnet-name>.ts.net" `
  -WhatIf
```

(substitute your real topic from Part 2.1 and URL from Part 1.5). Review the
output. When you're satisfied, run it for real — it will still ask you to
confirm each of the two tasks individually (registering a scheduled task is
flagged high-impact) unless you pass `-Confirm:$false`:

```powershell
.\scripts\register-scheduled-tasks.ps1 `
  -NtfyTopic "daybook-k3j9x2p7" `
  -AppUrl "https://<machine-name>.<tailnet-name>.ts.net"
```

Defaults if you don't override them: weekly nudge fires **Mondays at
09:00**; the settlement-eve check runs **daily at 09:00** (and only actually
sends a notification on the day before a Cycle ends). Override with
`-WeeklyDay`, `-WeeklyTime`, `-DailyCheckTime` — see
`Get-Help .\scripts\register-scheduled-tasks.ps1 -Full` for all parameters.

Both tasks are registered with **"run task as soon as possible after a
scheduled start is missed"** enabled (`StartWhenAvailable`), so if the
laptop is asleep or off at the scheduled time, the job catches up at next
boot/logon instead of being silently skipped — this satisfies the "run when
missed" requirement from SPEC.md §10.

### 3.3 Verify

```powershell
Get-ScheduledTask -TaskName "Daybook-*" | Get-ScheduledTaskInfo
```

Trigger one manually to confirm end-to-end delivery without waiting for the
schedule:

```powershell
Start-ScheduledTask -TaskName "Daybook-WeeklyNudge"
```

Check your phone for the notification. For the settlement-eve task, a
manual `Start-ScheduledTask -TaskName "Daybook-SettlementEveCheck"` will
usually **not** send anything (correctly) unless a Cycle genuinely ends
tomorrow for an active worker — that's the intended no-op behavior described
in the script's own comments. To sanity-check the underlying logic directly:

```powershell
npx tsx scripts\next-cycle-end.ts
```

This prints today's date, how many active workers exist, and the earliest
upcoming Cycle end among them — useful for confirming the check is reading
real data correctly.

### 3.4 Removing the tasks later

```powershell
Unregister-ScheduledTask -TaskName "Daybook-WeeklyNudge","Daybook-SettlementEveCheck" -Confirm:$false
```

### Why a daily check instead of one task per cycle end

Cycle end dates differ per worker (each has its own Cycle start day, SPEC.md
§1.6) and shift over time as workers are added, archived, or have their
Cycle start day or rate changed. Rather than re-registering a fresh
Scheduled Task trigger every time any of that happens, `next-cycle-end.ts`
is cheap enough to run once a day and simply no-op on the days nothing is
due — this needs zero maintenance as workers change, at the cost of one
extra Node process launch a day.

---

## Family onboarding note

Copy-paste or read this out to family members once Parts 1–2 above are
done:

> **Daybook is live.** Open **`https://<machine-name>.<tailnet-name>.ts.net`**
> on your phone — it's the same PIN we all use. Bookmark it, or better,
> add it to your home screen (Android: menu → Add to Home screen; iPhone:
> Share icon → Add to Home Screen) so it opens like an app.
>
> We also use **ntfy** to get reminders about marking Leave/Off days before
> payday. Install the free **ntfy** app (search "ntfy" on the Play Store or
> App Store), tap **+ Subscribe to topic**, and enter: **`<your topic here>`**
> — that's it, no account needed. You'll get a ping the week of and the day
> before each pay cycle closes if there's anything to double-check.

Fill in the actual URL (Part 1.5) and topic (Part 2.1) before sending — this
note intentionally leaves them as placeholders since they're specific to
your setup, not something to hardcode here.

---

## Acceptance checklist (from the ticket)

- [ ] App loads and is fully usable from a phone on mobile data via the
      Funnel URL; origin survives a host reboot — verify per Part 1.5 /
      1.7, and confirm again after actually rebooting the host once.
- [ ] Test ntfy ping lands on at least one subscribed phone — Part 2.4.
- [ ] Scheduled tasks exist, run when missed, and the settlement-eve job
      targets the day before the earliest upcoming cycle end — Part 3.2–3.3.
- [ ] Family onboarding note written — see above; send it once URL/topic
      are filled in.
