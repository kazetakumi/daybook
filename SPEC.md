# SPEC — Daybook (phase 1)

Build-ready spec assembled 2026-07-15 from the wayfinder map (`.wayfinder/map.md`). Vocabulary is normative and lives in [CONTEXT.md](CONTEXT.md) — UI copy and code identifiers use those terms. The one architectural ADR is [docs/adr/0001](docs/adr/0001-live-recomputation-with-payment-snapshots.md).

**What this is:** **Daybook** — a mobile-friendly household attendance & salary web app for one household. The name appears in the app header, the browser/home-screen title, and the PIN screen. Akhil and family (shared PIN) mark daily attendance for household Workers from their phones and settle each pay cycle's salary. Runs on Akhil's Windows 11 machine, reached through Tailscale Funnel.

**Out of scope for phase 1** (decided, do not build): React Native/app-store apps; advances, bonuses, or ad-hoc deductions; any maid-facing access or verification; automatic backups; Web Push.

---

## 1. Domain rules (normative)

1. A **Worker** has: name, optional role label, joining date, per-day **Rate** in whole ₹, **Cycle** start day (integer 1–28), **Paid-leave quota** per cycle (integer, default 2), optional archived date.
2. Every calendar day is a working day — no weekly offs.
3. Each Worker-day is exactly one of three states: **Present** (full Rate), **Leave** (worker didn't come), **Off** (employer said don't come; half Rate; never consumes quota).
4. **Unmarked days are Present.** Marks are stored only for Leave/Off; re-marking Present deletes the Mark. Any past day is editable at any time; days after "today" cannot be marked.
5. **Leave classification:** within a cycle, the earliest Leave dates (calendar order) up to the quota are **Paid leave** (full Rate); the rest are **Unpaid leave** (₹0). Recomputed live on every change — back-dating a Leave may legitimately flip a later one from paid to unpaid.
6. **Cycles:** from a config row `(start_day D, effective_from F)`, the first cycle is a stub `F → day-before-next-D` (skipped when F falls on D), then regular `D → day-before-next-D` cycles until the next config row or the archived date. This one rule covers joining *and* start-day changes. Stub cycles carry the **full** quota.
7. **Rate changes** take an effective-from date (default today). A cycle spanning a change splits: days before × old Rate + days from the date × new Rate.
8. **Cycle-start-day changes** take effect after the current cycle completes (one stub bridges to the new day).
9. **Settlement** (see §3) is pure attendance math. **"Mark paid"** snapshots the amount and date actually paid; days stay editable afterward, and any mismatch between a Payment and the live-computed total is displayed as **Drift**, never reconciled silently (ADR-0001).
10. **Archiving** hides a Worker from daily marking; history and Payments are kept forever. No hard delete. The final partial cycle ends on the archived date.
11. Money: Rates are whole ₹; per-day math keeps exact ₹.50 (from Off days); each cycle **total rounds UP** to the whole rupee. Display with `en-IN` grouping.

## 2. Data model — Supabase Postgres (postgres.js, raw SQL)

Six `daybook_*` tables in the `public` schema of the shared **kaze-master-in** Supabase project (ap-south-1), alongside other apps' prefixed tables. The schema's source of truth is [`supabase/migrations/`](supabase/migrations/) — applied deliberately, never by the server at startup. See [ADR 0002](docs/adr/0002-supabase-postgres-behind-the-pin-gated-server.md).

| Table | Columns |
|---|---|
| `daybook_workers` | `id` integer identity PK · `name` · `role` (optional label, e.g. 'Maid') · `joined_on` date · `archived_on` date or NULL · `paid_leaves_per_cycle` integer default 2 |
| `daybook_rate_periods` | `id` · `worker_id` → workers · `rate_rupees` integer · `effective_from` date (first row = joined_on) |
| `daybook_cycle_configs` | `id` · `worker_id` → workers · `start_day` integer CHECK 1–28 · `effective_from` date (first row = joined_on) |
| `daybook_marks` | PK (`worker_id`, `date`) · `state` CHECK in ('leave','off') — present = no row |
| `daybook_payments` | `id` · `worker_id` → workers · `period_start` · `period_end` · `amount_rupees` · `paid_on`; UNIQUE (`worker_id`, `period_start`, `period_end`) |
| `daybook_settings` | `key` PK · `value` — `pin_hash`, `session_secret` |

RLS is enabled on every table with **no policies**, so Supabase's Data API (anon/authenticated keys) sees nothing; only the Hono server, connecting as the database owner via `DATABASE_URL`, reads or writes. Access control stays the family PIN (§5).

Dates are ISO `YYYY-MM-DD` strings throughout the app (lexicographic compare = chronological). They are stored as Postgres `date` and read back as the same string — `src/server/db.ts` overrides postgres.js's default of turning them into JS `Date`s, which would shift a day in IST.

## 3. Salary calculation — pure function + fixtures

Implement in plain TypeScript with no I/O (`src/shared/settlement.ts`), imported by both server and client:

```
computeSettlement(worker, cycleWindow, marks, ratePeriods, today) → {
  counts:  { present, paidLeave, unpaidLeave, off },
  amounts: { present, paidLeave, off },     // unpaidLeave is always 0
  segments: [{ rate, amount }...],          // >1 entry iff rate changed mid-cycle
  exact, total,                             // total = ceil(exact)
  open                                      // window end ≥ today
}
```

Algorithm: days = `cycleWindow ∩ [joined_on, min(today, archived_on)]`; state per day = mark ?? Present; paid set = earliest `quota` Leave dates in the window; pay fraction Present 1 · Paid leave 1 · Off 0.5 · Unpaid leave 0; rate per day = covering rate_period; sum, then round up.

Also implement `cycleWindows(worker, today)` from rule §1.6, returning current window plus an iterator over past windows.

**Unit-test fixtures (must pass exactly):**

1. Rate ₹200, window Jun 1–30, Leaves Jun 5/12/20, Off Jun 25, quota 2 → present 26 = ₹5,200; paid leave 2 = ₹400; unpaid 1 = ₹0; off 1 = ₹100; **total ₹5,700**.
2. Rate ₹175 → ₹185 effective Jun 16, window Jun 1–30, Off Jun 10, Leave Jun 20, quota 2 → exact ₹5,312.50, **total ₹5,313**, two segments.
3. Joined Jun 20, start day 1 → first window is stub **Jun 20–30**, quota still 2.
4. Quota reflow: quota 2, Leaves Jun 18/25 (both paid); adding a Leave on Jun 3 makes Jun 3+18 paid and **Jun 25 unpaid**.

## 4. UI — Worker-card hub (settled by prototype, ticket 007)

Reference implementation of look/feel: `prototype/ui-variants.html`, **Variant C** (`?variant=C`). Rewrite properly; do not copy prototype code. Mobile-first (~420 px column), light+dark themes, day-state colours and settlement-row layout as prototyped.

- **Home:** one card per active Worker — avatar/initial, name, "x of N leaves used", running cycle amount + window, cycle progress bar, and inline **P / L / O** buttons that mark *today* directly (tapping the active state back to Present clears it). "+ Add worker" beneath. First run with no PIN configured → setup screen (§5); with no workers → empty state pointing at "+ Add worker".
- **Worker hub** (tap a card): header (name, current window), segmented control:
  - **Cycle** — calendar grid of the current window (Monday-first), colour-coded states, today ringed, future days dimmed/disabled; **tap a day to cycle Present → Leave → Off**; legend beneath; ability to step back to previous windows.
  - **Settle** — settlement breakdown for the current window (rows: Present / Paid leave n of quota / Unpaid leave / Off — half pay, with counts and amounts; rate-split note when segmented; exact + rounded total), then past cycles: each with total, Payment chip ("Paid ₹X on date") or **"Mark paid — ₹X"** button, and a Drift banner when computed ≠ paid. **"Share"** button per settled view (§6).
  - **Details** — rate (with "Change rate…" → new rate + effective-from date), cycle start day (change applies per rule §1.8 — show "takes effect next cycle"), quota, joined date, **Archive worker** (confirm dialog).
- **Settings/about** (small gear on home): change PIN, **Download backup** (§8), app version.

## 5. Auth — family PIN

Defaults chosen at spec time; build as stated:

- One shared PIN, 4–6 digits. Stored in `daybook_settings.pin_hash` as **scrypt** (Node `crypto.scrypt`, per-hash random salt).
- First run (no `pin_hash`): the app serves a set-PIN screen; setting it requires confirmation entry.
- Login: PIN entry → on success a **signed HttpOnly SameSite=Lax session cookie**, 180-day expiry, HMAC key kept in `daybook_settings`. All `/api/*` except login/health require it. Client shows the PIN screen on any 401.
- Brute-force damping: global exponential backoff — after 5 consecutive failures, delay responses 2 s, doubling per failure, reset on success (client IPs behind the Funnel aren't trustworthy, so the counter is global).
- Change PIN (in Settings) requires the current PIN.

## 6. Share (ticket 008)

"Share" on a settlement builds a plain-English text block — worker name, cycle window, one line per category (`count × rate = amount`), total, and `Paid ₹X on <date>` when paid — and calls `navigator.share({ text })`; if unsupported, copies to clipboard with a "Copied" toast. English only; no image rendering.

## 7. Stack, layout, run

- **Client:** Vite + React + TypeScript. **Server:** Hono on `@hono/node-server`, also serving the built client via `serve-static` — one process, one port (default **3000**). **DB:** Supabase Postgres via postgres.js, raw SQL (§2); `DATABASE_URL` comes from `.env` (gitignored — see `.env.example`). **Tests:** Vitest on `computeSettlement` + cycle generation (§3 fixtures); server tests run against a *local* Postgres named by `TEST_DATABASE_URL`, each in a throwaway schema.
- API sketch: `POST /api/login` · `GET /api/home` (cards data) · `POST /api/workers` · `PATCH /api/workers/:id` (quota/archive) · `POST /api/workers/:id/rate` `{rate, effectiveFrom}` · `POST /api/workers/:id/cycle-config` `{startDay}` · `PUT /api/marks/:workerId/:date` `{state: 'leave'|'off'|'present'}` (present deletes) · `GET /api/workers/:id/cycles?before=` (windows + settlements) · `POST /api/payments` · `GET /api/backup`.
- Scripts: `npm run dev` (Vite + server, proxied), `npm run build`, `npm start` (serve built app), `npm test`.
- The public origin is config (`PUBLIC_ORIGIN` env), not hardcoded.

## 8. Backup (ticket 010)

`GET /api/backup` (authed) downloads `daybook-YYYY-MM-DD.json`: every row of the five data tables, read inside one `REPEATABLE READ` transaction so it's a consistent snapshot while the app is in use. `daybook_settings` is excluded — the PIN hash and session key don't belong in a file on a phone. Exposed as **Download backup** in Settings. No automatic backups in phase 1 (Supabase's own backups cover the whole shared project, not one app's rows).

## 9. Hosting — Tailscale Funnel (ticket 002)

Full research: `.wayfinder/research/tunnel-options.md`. Setup on the Windows 11 host:

1. `winget install Tailscale.Tailscale`, sign in (free Personal tailnet).
2. Admin console → DNS: enable **MagicDNS** and **HTTPS Certificates**.
3. `tailscale funnel --bg 3000` (first run prints a one-click policy-enable URL). `--bg` persists across reboots.
4. Share `https://<machine>.<tailnet>.ts.net` with family once — bookmark / Add to Home Screen. Don't rename the machine (renames change the origin).

## 10. Reminders — ntfy.sh (ticket 003)

Full research: `.wayfinder/research/reminder-delivery.md`. No in-app code beyond optionally pre-scheduling (below).

1. Pick one secret topic, e.g. `daybook-<random>`; each family phone installs the ntfy app and subscribes (one-time).
2. Windows Task Scheduler job(s) with "run when missed" enabled: **settlement-eve** (day before each cycle end — a small script may query the app/DB for the next cycle end) and an optional **weekly** nudge, each running `curl -d "Any Leave or Off days to mark? <app URL>" ntfy.sh/<topic>`. Not daily — unmarked days are Present, so only exceptions matter.
3. Optional hardening: the server pre-schedules the settlement-eve message with ntfy's `At:` header so it fires even if the laptop sleeps.

## 11. Acceptance checklist

- [ ] All §3 fixtures pass as unit tests; marking/unmarking days updates totals live everywhere.
- [ ] Home marking, calendar tap-cycling, Mark paid, Drift display, rate change with mid-cycle split, cycle-day change with stub, archive — all work as specced against CONTEXT.md language.
- [ ] PIN gate on every API route; session survives browser restarts; backoff works.
- [ ] Share produces the §6 text via share sheet on Android Chrome and iOS Safari (clipboard fallback verified).
- [ ] Backup downloads as valid JSON containing every data table while the app is running.
- [ ] App reachable and usable from a phone on mobile data via the Funnel URL.
