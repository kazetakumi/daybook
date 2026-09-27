# Supabase Postgres behind the PIN-gated server

Daybook's data moved from a SQLite file on the host laptop to six `daybook_*` tables in the shared **kaze-master-in** Supabase project (ap-south-1), reached only by the existing Hono server over a direct Postgres connection (postgres.js, raw SQL, session pooler). Only the database moved. The server still runs on the laptop behind Tailscale Funnel, and access control is still the shared family PIN. We did this because the laptop's disk was the only copy of the household's attendance and payment history. We kept the change narrow: going Supabase-native (Supabase Auth plus RLS, and the client talking to Supabase directly) would have meant rewriting auth and much of the client for one household, and the PIN model already fits how the family uses the app.

## Considered options

- **Move the server off the laptop too** (for example to a hosted Node service, with reminders as pg_cron or a scheduled function). Deferred rather than rejected. The laptop is still a single point of failure for *uptime*, but no longer for *data*. Because the server connects to Postgres directly, moving the host later is a deployment change, not a data change.
- **Supabase Auth with sign-up and households.** Considered and deferred. The shared project's `auth.users` pool is common to every app on it, so Daybook would need its own membership table (`daybook_households` / `daybook_household_members`, with `workers.household_id`). That will be a new migration when it happens.
- **A dedicated Supabase project.** Rejected. The free tier caps active projects, and a project that goes quiet gets paused. The shared project follows the existing convention of app-prefixed tables and is kept active by the other apps.
- **supabase-js with the service-role key.** Rejected in favour of a direct Postgres connection. It would have kept raw SQL out of reach, needed RPC functions for multi-statement transactions, and added a key that bypasses everything.

## Consequences

- RLS is enabled with **no policies** on every `daybook_*` table, so the anon and authenticated keys see nothing through the Data API. The server connects as the owner role and bypasses RLS; the PIN gate in front of `/api/*` is the only way in.
- The schema lives in `supabase/migrations/` and is applied deliberately. The server never runs DDL: at startup it checks that `daybook_settings` exists and refuses to start if it doesn't.
- Every DB call is async. Dates are Postgres `date` values, but they reach the app as `'YYYY-MM-DD'` strings (a type-parser override in `src/server/db.ts`), so `src/shared/settlement.ts` is unchanged.
- The migration copied `pin_hash` and `session_secret` along with all domain rows, so the PIN and every phone's 180-day session carried over unchanged.
- "Download backup" now exports JSON (it can no longer be a `.sqlite` file) and leaves out `daybook_settings`. Supabase's own backups cover the whole shared project, so they are not a practical way to restore one app's rows.
- Server tests need a local Postgres (`TEST_DATABASE_URL`) and run each test in a throwaway schema. They can never reach Supabase, because only `TEST_*` variables are loaded into the test environment.
