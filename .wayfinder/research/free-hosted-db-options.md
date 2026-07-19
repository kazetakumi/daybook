# Research: free hosted database options as an alternative to local SQLite

Researched 2026-07-19. Prompted by weighing whether Daybook's `better-sqlite3` local file (`data/daybook.sqlite`, see [SPEC.md §2](../../SPEC.md)) should move to a hosted database if the app ever leaves Akhil's Windows machine (e.g. onto a VPS or a serverless platform like Vercel, where a local SQLite file either can't persist or is inconvenient).

Schema recap (from SPEC.md §2): 6 small tables (`workers`, `rate_periods`, `cycle_configs`, `marks`, `payments`, `settings`), one household, single-digit users, plain SQL via `better-sqlite3` — no ORM. Traffic is near-zero.

## TL;DR

**If self-hosting on a VPS (or staying on the current Windows machine), keep local SQLite — no hosted DB needed.** A VPS gives you a persistent disk, and `better-sqlite3` is faster and simpler than any network hop to a hosted DB for this traffic level.

**If moving to a serverless platform (Vercel, Cloudflare Workers, etc.) where no local disk persists, Turso is the best-fit hosted option**: it's SQLite-compatible (same dialect the app already writes), free forever with no credit card, and HTTP-based so it works from edge/serverless runtimes that can't hold a TCP connection open. **Neon** (serverless Postgres) is the strongest runner-up if a move to Postgres semantics is acceptable — its free tier is also permanent, and its HTTP/WebSocket serverless driver solves the same edge-connection problem, at the cost of a schema/query dialect migration.

---

## 1. Turso (hosted libSQL / SQLite-compatible)

- **Free forever, no credit card**: "Start free today, no credit card required." ([turso.tech/pricing](https://turso.tech/pricing))
- **Storage**: 5 GB total, then $0.75/GB overage.
- **Reads**: 500 million rows read/month, then $1/billion.
- **Writes**: 10 million rows written/month, then $1/million.
- **Databases**: 100 databases (100 monthly active databases) included on the free plan.
- **Sync**: 3 GB/month embedded-replica sync allowance, then $0.35/GB.
- **Point-in-time restore**: 1 day retention on free.
- **Support**: community only; no audit logs on free.

(All limits per [turso.tech/pricing](https://turso.tech/pricing), fetched 2026-07-19.)

**SQL compatibility**: Turso Database is explicitly "fully backwards compatible with SQLite" ([docs.turso.tech/introduction](https://docs.turso.tech/introduction)) — this is the same SQL dialect `better-sqlite3` already speaks, so `schema.sql` and the app's raw queries should need little to no rewriting (parameter placeholder styles `?`, `:name`, `$name`, `@name` are all supported).

**Connection model — HTTP, not TCP**: queries go over HTTP (`POST` to `/v2/pipeline`, or via the `@libsql/client` driver's `/web` import, or the newer zero-dependency `@tursodatabase/serverless` package built purely on `fetch`) ([docs.turso.tech/sdk/http/quickstart](https://docs.turso.tech/sdk/http/quickstart)). This is exactly the connection style serverless/edge platforms need (no long-lived TCP socket required), making it a natural fit for Vercel functions or Cloudflare Workers.

**Gotchas / history**:
- Free-tier limits have moved before: Turso cut free-tier allocations (to the current 500M reads / 10M writes / 5 GB figures above) effective March 31, 2025, while still marketing it as "the most generous in the database market" ([turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap)). A paid "Hobby" plan at $9/mo was later replaced by a cheaper "Developer" plan at $4.99/mo billed yearly ([turso.tech/blog/turso-cloud-debuts-the-new-developer-plan](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan)). Free-tier terms are not contractually frozen — worth re-checking before committing long-term.
- The underlying engine ("Turso Database") is a from-scratch Rust rewrite of SQLite (the former "Limbo" project), distinct from the original `libSQL` fork — still described as SQLite-compatible, but it's a newer codebase than upstream SQLite/`better-sqlite3` and worth a compatibility smoke-test against the app's exact queries.
- No inactivity-based pausing mentioned on the pricing page (unlike Neon/Supabase below) — reads as always-on.

## 2. Neon (serverless Postgres)

- **Free plan is "permanent (not a trial); no credit card required."** ([neon.com/pricing](https://neon.com/pricing), fetched 2026-07-19)
- **Storage**: 0.5 GB per project, 1 GB history/branch-restore window.
- **Compute**: 100 CU-hours/month per project, autoscaling up to 2 CU (8 GB RAM).
- **Projects/branches**: 100 projects, 10 branches per project (10 branches per project cap org-wide).
- **Autosuspend**: compute "suspends automatically after inactivity (scale-to-zero)" — 5 minutes on the free tier. Suspended compute costs $0, but this means a **cold start** on the first request after idling (typical for a household app used a few times a day).
- **Network transfer**: 5 GB egress included; no private networking on free.
- **Overage behavior**: hitting free limits suspends compute until the next billing month unless you upgrade — no surprise bill, but the app goes down.

**SQL compatibility**: full Postgres, not SQLite — the app's raw SQL (`better-sqlite3` today) would need a rewrite: syntax differences (e.g., `INTEGER PRIMARY KEY` autoincrement semantics, upsert syntax, date/text handling), and swapping `better-sqlite3` for a Postgres driver (`pg`, `postgres.js`, etc.). Given Daybook's schema is small and uses plain SQL with no ORM, this is a bounded but real migration, not a config change.

**Connection model**: standard Postgres wire protocol (TCP) for normal use, connection pooling included on all plans. For serverless/edge specifically, Neon ships a **serverless driver** that talks HTTP (single "one-shot" queries) or WebSockets (session/interactive transactions, `node-postgres`-compatible) instead of raw TCP, explicitly built because "these platforms prevent long-lived TCP connections" ([neon.com/docs/serverless/serverless-driver](https://neon.com/docs/serverless/serverless-driver)). Raw SQL works directly through it (``sql`SELECT * FROM table` ``), no ORM required.

**Gotchas**: cold start after 5-minute idle is the main one for a low-traffic household app — first request after a gap pays a compute wake-up penalty. 0.5 GB storage is generous for this schema (six small tables) but worth knowing it's per-project, not pooled.

## 3. Supabase (Postgres + platform)

- **What's free "forever" per the pricing page**: dedicated Postgres database, unlimited API requests, unlimited total users, anonymous sign-in/OAuth, custom SMTP, basic MFA, custom storage access controls ([supabase.com/pricing](https://supabase.com/pricing), fetched 2026-07-19).
- **Storage**: 500 MB database size (shared CPU, 500 MB RAM), 1 GB file storage, 5 GB egress + 5 GB cached egress.
- **Monthly active users**: 50,000 (auth MAUs) — irrelevant at household scale but shows the tier is aimed at small real apps, not toy limits.
- **Projects**: limit of **2 active projects**; free projects **pause after 1 week of inactivity** (can be manually unpaused, or kept paused indefinitely beyond the 2-project active cap).
- **Connections**: 60 direct Postgres connections, 200 pooler connections on the free shared compute tier.
- The pricing page doesn't state a credit-card requirement explicitly.

**SQL compatibility**: same as Neon — full Postgres, requires migrating off SQLite-flavored raw SQL and `better-sqlite3`.

**Connection model**: three options — direct TCP (port 5432, best for persistent servers/VMs), Supavisor shared pooler (session mode on 5432 for IPv4-only persistent backends, transaction mode on 6543 recommended for serverless/edge), and a dedicated PgBouncer pooler on paid plans. Direct connections default to IPv6-only; the shared pooler is IPv4-only on every tier, which matters if a target platform can't reach IPv6 ([supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)). Supabase also exposes a Postgres database over a REST API (PostgREST) and its own JS client, but Daybook's current raw-SQL approach maps more directly onto the TCP/pooler path than the REST layer.

**Gotchas**: the **1-week inactivity pause** is the standout risk for a household app that might only be opened a few times a week around cycle-end/settlement — a paused project needs a manual (or API-triggered) unpause before it will serve traffic, which is a worse cold-start story than Neon's few-second compute wake. The 2-active-project cap is a non-issue for a single app.

## 4. PlanetScale (MySQL-compatible) — **no free tier anymore**

PlanetScale's free "Hobby" tier was removed in April 2024: existing free databases had to upgrade by April 8, 2024 or were put into sleep mode; CEO Sam Lambert cited wanting "a reliable and sustainable platform" rather than "giving away endless amounts of free resources to keep growing" ([planetscale.com/docs/plans/hobby-plan-deprecation-faq](https://planetscale.com/docs/plans/hobby-plan-deprecation-faq); reporting: [Smashing Magazine, "The End of the Free Tier," Apr 2024](https://www.smashingmagazine.com/2024/04/end-of-free-tier/)).

Current pricing page ([planetscale.com/pricing](https://planetscale.com/pricing), fetched 2026-07-19) shows **no free plan** — only paid tiers. Cheapest is a single-node Postgres "PS-5" SKU at **$5/month** (1/16 vCPU, 512 MiB RAM); their MySQL-compatible "Scaler" plan (the historical PlanetScale product) starts around $39/month for 10 GB storage. Note PlanetScale now also offers a **Postgres** product alongside its original MySQL/Vitess offering, so "PlanetScale = MySQL" is no longer strictly true, but neither product has a free tier today.

**Verdict**: ruled out — not a "free forever" option, and never was SQLite-compatible in the first place (MySQL dialect, would require the same kind of query rewrite as Postgres options, for less benefit).

## 5. Cloudflare D1 (SQLite at the edge)

- **Genuinely free, permanently, not a trial**: "Yes, the Workers Free plan will always include the ability to prototype and experiment with D1 for free." ([developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/), fetched 2026-07-19)
- **Storage**: 5 GB total.
- **Rows read**: 5 million/day.
- **Rows written**: 100,000/day.
- Exceeding limits returns hard errors to the client ("D1 API will return errors ... indicating that your daily limits have been exceeded"); storage overage blocks new inserts until data is deleted rather than silently billing you.

**SQL compatibility**: D1 uses "SQLite's SQL semantics" ([developers.cloudflare.com/d1](https://developers.cloudflare.com/d1/)) — same dialect fit as Turso.

**Connection model**: two paths.
1. **Workers bindings** — the primary, intended way in: your application logic runs *as* a Cloudflare Worker and D1 is bound directly into it. This means moving off Node/Hono-on-a-server entirely and rewriting the backend as Workers code — a much bigger lift than just swapping a DB driver.
2. **HTTP REST API** — Cloudflare also exposes a direct query endpoint (`POST /accounts/{account_id}/d1/database/{database_id}/query`) callable from any external HTTP client (e.g. a Node app on Vercel) using a Cloudflare API token in the `Authorization: Bearer` header, with no Worker in between ([developers.cloudflare.com/api/resources/d1/subresources/database/methods/query](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)). This makes D1 usable without a full platform migration, though it reads as a general-purpose/management API rather than a driver purpose-built for app traffic (no documented connection pooling or low-latency guarantees for this path), and the daily row-write cap (100K/day) is comfortably enough for this app but worth knowing is a *daily*, not monthly, ceiling.

**Gotcha**: getting the best of D1 (bindings, no extra hop) means committing to the Workers runtime for the whole backend, not just the database — a bigger architectural decision than picking Turso or Neon, which are usable as a drop-in DB from an otherwise normal Node app anywhere (VPS or serverless).

## 6. Railway — no genuine free tier

Railway's current pricing ([railway.com/pricing](https://railway.com/pricing), fetched 2026-07-19) offers:
- **Free Trial**: a **one-time $5 credit**, no credit card required — a trial, not an ongoing free allowance.
- **Hobby**: $5/month with included usage, for solo devs/side projects.
- **Pro**: $20/seat/month.

Railway bills databases (Postgres/MySQL) under its general per-second CPU/memory/disk consumption model — there's no separate always-free database SKU. Once the one-time trial credit is exhausted, a Postgres/MySQL instance on Railway costs real money even at near-zero traffic (it still holds memory/disk 24/7). **Ruled out** as a "free forever" option, though notable as a good *cheap* option ($5/mo Hobby) if a traditional always-on Postgres/MySQL with a normal TCP connection is wanted and a small recurring cost is acceptable — this is close in shape to "just rent a $5 VPS."

## 7. Other candidates checked

- **CockroachDB Serverless ("Basic" plan)**: genuinely free-forever tier — "50 million RUs and 10 GiB storage free per month," no credit card required for the Basic/Standard plans, scaling to 3 TiB total ([cockroachlabs.com/pricing](https://www.cockroachlabs.com/pricing/), fetched 2026-07-19). Postgres-wire-compatible (CockroachDB speaks the Postgres protocol), so it carries the same dialect-migration cost as Neon/Supabase, without the household-name ecosystem or the HTTP/edge-native driver Neon offers. Viable but not clearly better than Neon for this use case.
- **PlanetScale Postgres** — covered above under §4; no free tier.
- **Fly.io**: no current free allowance for Postgres or anything else. Fly.io removed its permanent free tier in 2024 (previously 3 shared-CPU VMs + a free Postgres instance + 160 GB bandwidth); new orgs created after October 7, 2024 are pay-as-you-go only, with legacy accounts grandfathered on old allowances ([fly.io/pricing](https://fly.io/pricing/) shows no free tier today; change confirmed via [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing/) and third-party reporting). Managed Postgres plans start around $38/month. Ruled out.
- **ElephantSQL** (the formerly-canonical "free tiny Postgres" service) — included here only as a cautionary data point on how quickly this market shifts: it stopped accepting new signups after May 1, 2024, and reached full end-of-life on **January 27, 2025**, with the company redirecting focus to its CloudAMQP/RabbitMQ product ([elephantsql.com/blog/end-of-life-announcement.html](https://www.elephantsql.com/blog/end-of-life-announcement.html)). A reminder that "free hosted DB" recommendations have a shelf life and should be re-verified before a real migration, not just trusted from memory or an old blog post.

## 8. Comparison table

| Provider | Free forever? | SQL dialect | Storage (free) | Other free-tier caps | Connection model | Cold start / pausing |
|---|---|---|---|---|---|---|
| **Turso** | Yes, no card | SQLite-compatible | 5 GB | 500M rows read/mo, 10M rows written/mo, 100 DBs | HTTP (`@libsql/client`, `fetch`-based) | Not documented — reads as always-on |
| **Neon** | Yes, no card | Postgres | 0.5 GB/project | 100 CU-hrs/mo, 100 projects | TCP + HTTP/WebSocket serverless driver | Autosuspends after 5 min idle → cold start on wake |
| **Supabase** | Yes (core DB), card unclear | Postgres | 500 MB | 2 active projects, 60 direct / 200 pooled conns | TCP direct, or Supavisor pooler (IPv4) | **Pauses whole project after 1 week idle** — manual/API unpause needed |
| **PlanetScale** | **No** — removed Apr 2024 | MySQL or Postgres | — | — | TCP | N/A |
| **Cloudflare D1** | Yes, permanent | SQLite semantics | 5 GB | 5M rows read/day, 100K rows written/day | Workers binding (needs Workers backend), or external HTTP query API | Not documented; hard errors on cap breach |
| **Railway** | **No** — $5 one-time trial only | Postgres/MySQL (TCP) | — | — | TCP | N/A |
| **CockroachDB Serverless** | Yes, no card | Postgres-wire | 10 GiB | 50M RUs/mo | TCP | Not documented |

## 9. Recommendation

The two live constraints that matter most for Daybook: (1) the app's raw SQL is already SQLite dialect via `better-sqlite3`, so anything SQLite-compatible is a near-zero migration and anything Postgres/MySQL is a real (if small, given 6 tables) rewrite; (2) traffic is near-zero, so generous free-tier ceilings are moot — the deciding factors are really *connection model fit* and *does the free tier actually stay free*.

- **Staying self-hosted (current Windows machine, or any VPS)**: don't add a hosted DB at all. Local SQLite via `better-sqlite3` is simpler, faster, and has no network dependency, and a VPS gives a persistent disk exactly like the current machine does. This is the status quo recommendation and requires no change from SPEC.md §2/§7.

- **Moving to a serverless platform (Vercel, Cloudflare Pages/Workers, etc.) where no local disk persists between invocations**: **Turso** is the best fit — same SQL dialect the app already speaks (schema.sql and query strings should carry over close to as-is), genuinely free forever with no credit card, and its HTTP-based client is built for exactly the "no persistent TCP socket" constraint serverless functions impose. Swap `better-sqlite3` for `@libsql/client` (or the newer zero-dependency `@tursodatabase/serverless`) and point it at a Turso database URL; the rest of the data-access code should need minimal changes.

- **If Postgres semantics are acceptable (e.g. because a future feature wants something SQLite doesn't do well, or Turso's newer Rust-rewrite engine feels like an added risk)**: **Neon** is the runner-up — also a genuinely permanent free plan, and its serverless driver solves the same edge-connection problem as Turso's HTTP client. The cost is a one-time schema/query rewrite from SQLite to Postgres dialect and swapping in a Postgres client library. Supabase is a reasonable third choice with a materially worse free-tier gotcha for a low-traffic app: **projects pause after 1 week of inactivity**, which is a real risk for a household app that might go quiet between settlement cycles, versus Neon's much shorter 5-minute autosuspend (annoying cold start, not a dead project).

- **Avoid**: PlanetScale and Railway (no real free tier anymore), Fly.io (no free tier since Oct 2024). Cloudflare D1 is compelling on paper (SQLite semantics, permanent free tier) but its best access path requires rewriting the backend to run as Cloudflare Workers rather than a normal Node/Hono server — a bigger architectural commitment than the task ("swap the DB") calls for; its external HTTP query API is a workable escape hatch but isn't purpose-built as an app driver the way Turso's is.

## Sources

- Turso: [pricing](https://turso.tech/pricing) · [introduction / SQLite compatibility](https://docs.turso.tech/introduction) · [HTTP API quickstart](https://docs.turso.tech/sdk/http/quickstart) · [free-tier limit changes, Mar 2025](https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap) · [Developer plan announcement](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan)
- Neon: [pricing](https://neon.com/pricing) · [serverless driver docs](https://neon.com/docs/serverless/serverless-driver)
- Supabase: [pricing](https://supabase.com/pricing) · [connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- PlanetScale: [pricing](https://planetscale.com/pricing) · [Hobby-plan deprecation FAQ](https://planetscale.com/docs/plans/hobby-plan-deprecation-faq) · [Smashing Magazine, "The End of the Free Tier," Apr 2024](https://www.smashingmagazine.com/2024/04/end-of-free-tier/)
- Cloudflare D1: [D1 overview](https://developers.cloudflare.com/d1/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [REST query endpoint](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
- Railway: [pricing](https://railway.com/pricing)
- CockroachDB: [pricing](https://www.cockroachlabs.com/pricing/)
- Fly.io: [pricing](https://fly.io/pricing/) · [resource pricing docs](https://fly.io/docs/about/pricing/)
- ElephantSQL: [end-of-life announcement](https://www.elephantsql.com/blog/end-of-life-announcement.html)
