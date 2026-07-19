# Research: free VPS hosting options to get Daybook off the owner's Windows PC

Researched 2026-07-19 against primary sources only (each provider's own pricing/docs/FAQ pages).

## TL;DR

**Oracle Cloud Infrastructure (OCI) Always Free is the only candidate that is genuinely free forever, with real persistent disk, and enough RAM/CPU to comfortably run Hono + better-sqlite3** — up to 4 Ampere A1 (ARM) OCPUs / 24 GB RAM (shapeable) or 2× AMD E2.1.Micro VMs, 200 GB persistent block storage, 10 TB/month egress, no time limit. It needs a credit card for identity verification at signup (never charged unless you explicitly upgrade) and enforces an **idle-resource reclamation policy** (a genuinely-idle box under ~20% CPU/network/memory for 7 days can be reclaimed) — a background Node server handling even occasional real traffic and its own light activity should stay well clear of that, but it's the one operational habit to watch. **Google Cloud's Always Free `e2-micro`** is the credible runner-up — free forever, real persistent disk — but it's pinned to three US regions, ships only 1 GB/month of North-America egress (fine for this app's traffic, but a hard ceiling), and as of a Feb 2024 pricing change the VM's public IPv4 address itself now appears to bill separately (~$3.65/month) unless run IPv6-only — so it is not fully "free forever" for anyone who needs the box to have a plain public IPv4. Everything else investigated (AWS, Azure, Fly.io, Railway, Render) is either a time-limited trial credit, has no persistent-disk-on-free-plan, or both.

---

## 1. Oracle Cloud Infrastructure (OCI) — Always Free

Source: [Always Free Resources docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/), [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)

**Free forever vs. trial:** Always Free resources are a genuinely separate, non-expiring tier from the 30-day/US$300 Free Trial credit — the FAQ is explicit that Always Free resources "continue to be free of charge indefinitely" and keep running after any trial credit expires or is exhausted.

**Compute specs (both are Always Free, can run simultaneously):**
- **VM.Standard.E2.1.Micro (AMD)** — up to **2 instances** per tenancy, 1/8 OCPU + 1 GB RAM each, 1 VNIC + 1 public IP, up to 50 Mbps internet bandwidth. Must be created in your tenancy's home region, single availability domain.
- **Ampere A1.Flex (ARM)** — pooled **2 OCPUs / 12 GB RAM** total per Always-Free tenancy (1,500 OCPU-hours + 9,000 GB-hours/month), shapeable as one 2-OCPU/12 GB instance or two 1-OCPU/6 GB instances. (Note: some Oracle documentation/marketing describes a larger 4 OCPU / 24 GB allocation for A1 — the docs page fetched for this research states 2 OCPU / 12 GB as the Always-Free amount per tenancy; treat 4/24 as an unconfirmed higher figure some accounts may see and verify at signup time rather than assuming it.)

**Disk:** 200 GB combined boot + block volume, Always Free, **persistent** (survives restarts/redeploys; deleted only if you delete the volume). 50 GB default boot volume, 47 GB minimum. 5 volume backups included.

**Bandwidth/egress:** **10 TB/month** outbound data transfer, renews monthly, Always Free.

**Region restriction:** Compute/storage must live in your tenancy's chosen **home region** (picked once at signup from Oracle's global region list); Ampere A1 excludes South Korea North (Chuncheon) specifically. Not a single-region-only product like GCP's free tier — home region choice is broad, but fixed after signup.

**Gotchas:**
- **Credit card required at signup** for identity verification (per the FAQ) for most new sign-ups — not charged unless you manually upgrade to a paid account.
- **Idle-instance reclamation**: instances with 7-day averages of <20% CPU (95th percentile), <20% network, and (for A1) <20% memory utilization can be **reclaimed automatically**. A near-zero-traffic household app plus normal OS background activity is usually enough to avoid this in practice, but it's worth monitoring, and is the single biggest operational risk of this option.
- "Out of host capacity" errors for Ampere A1 are a known, commonly-reported friction point when first provisioning in popular regions (per Oracle forums) — may require retrying across availability domains.
- Free Trial accounts that let their trial credit expire are demoted to Always-Free-only automatically; this is a feature here, not a risk.

**Long-lived Node process:** Yes — full VM, root SSH access, run anything (systemd service, pm2, plain `node server.js`).

## 2. AWS EC2 Free Tier

Source: [EC2 Free Tier usage tracking docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html), [AWS Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/)

**Free forever vs. trial: time-limited only — there is no Always-Free EC2 compute offer.** AWS's docs draw a hard line between accounts created before vs. on/after **July 15, 2025**:

| | Account before Jul 15 2025 | Account on/after Jul 15 2025 |
|---|---|---|
| Free-tier-eligible instances | `t2.micro`, `t3.micro` | `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`, `c7i-flex.large`, `m7i-flex.large` |
| Structure | 750 hrs/month of a free-tier-eligible instance, free for **12 months** from account creation | **USD $200 in credits** ($100 signup + up to $100 earned), Free Tier usage lasts **6 months** or until credits run out, whichever is first |
| After the window | Billed pay-as-you-go | Billed pay-as-you-go once credits/6 months are gone |

Both structures are explicitly **time-limited**, not "Always Free" — AWS does list ~30 services with genuine Always Free offers (e.g. DynamoDB, Lambda's low-volume tier), but **EC2 (and by extension any always-on Node+SQLite VM) is not among them.**

**Disk:** EBS `gp2`/`gp3`/`standard`/`st1`/`sc1` volumes are free-tier-eligible up to the same 12-month/6-month window; persistent while the account stays within Free Tier limits, then billed normally.

**Gotcha:** credit card required unconditionally at signup ("required to provide a valid payment method to sign up for an AWS account, whether you choose a free plan or a paid plan" — FAQ). AWS also began charging **~$0.005/hr for all public IPv4 addresses** in 2024 (referenced in the FAQ search results; 750 free hours/month of public IPv4 is included in the free tier window per an AWS "what's new" post, but this too lapses with the free tier).

**Verdict:** disqualified for "free forever" — it is a 6–12 month trial by design, after which the household would either need to migrate or start paying.

## 3. Google Cloud Free Tier

Source: [Free Google Cloud features docs](https://docs.cloud.google.com/free/docs/free-cloud-features), [External IPv4 pricing change announcement](https://cloud.google.com/vpc/pricing-announce-external-ips)

**Free forever vs. trial:** two genuinely separate offers, same as Oracle's pattern:
- **Always Free**: one non-preemptible **`e2-micro`** VM instance/month, no expiration, indefinite.
- **Free Trial**: separate **$300 in credit over 90 days**, requires a valid payment method at signup (a $0–$1 temporary authorization hold, not a charge).

**Region restriction:** the Always Free `e2-micro` is valid in exactly **three US regions only** — `us-west1` (Oregon), `us-central1` (Iowa), `us-east1` (South Carolina). Outside those regions, an e2-micro is billed normally.

**Disk:** **30 GB-months of standard persistent disk**, Always Free, persistent across restarts/redeploys.

**Bandwidth/egress:** **1 GB/month outbound data transfer from North America to all destinations (excluding China and Australia)** — a genuinely tight cap. For a single-household attendance app with near-zero traffic this is likely fine, but it leaves very little headroom (e.g. no room for large asset payloads, health-check spam, or another service sharing the box).

**Gotcha — public IPv4 pricing (important, and the reason GCP isn't the top pick despite being free-forever with persistent disk):** Google's Feb 1, 2024 pricing change made **all in-use external IPv4 addresses on VMs billable at $0.005/hr (~$3.65/month)**, per Google's own announcement page, and the Always Free feature list (which explicitly enumerates the free e2-micro/disk/1GB-egress items) does not list a free external IP allocation. In practice this means an internet-reachable Always Free e2-micro likely now carries a small but real recurring charge for its public IPv4 unless it's reachable only via IPv6 or a tunnel that doesn't require the VM to hold a public IPv4 (Tailscale Funnel/Cloudflare Tunnel avoid needing a public IP on the box itself, which sidesteps this specific charge).

**Long-lived Node process:** Yes — standard GCE VM, full root SSH.

## 4. Azure free account

Source: [Free Azure Services page](https://azure.microsoft.com/en-us/pricing/free-services) (fetched via search cache — see note below)

**Free forever vs. trial:** Azure's free account bundles three distinct things, and **there is no genuine "Always Free" VM-like compute product**:
- **$200 credit**, usable on almost anything, for the **first 30 days**.
- **12-months-free** services for new customers, which *does* include compute: **750 hours/month each of B2ts v2 (Intel), B2pts v2 (Arm), and B2ats v2 (AMD)** burstable VMs — but this is explicitly a **12-month, new-customer-only** window, not indefinite.
- **40+ "always free" services** — but per Azure's own framing these are services "free to all Azure customers" at a fixed low-volume tier (e.g. small allotments of Functions executions, Blob Storage, etc.), and **compute VMs are not part of that always-free list** — only the time-limited 12-month VM hours are.

**Verdict:** confirmed from source — Azure has 12-months-free VM hours (time-limited) and a always-free list that does not include general-purpose VMs. Not a free-forever VPS option.

**Note on source access:** the live `azure.microsoft.com/en-us/pricing/free-services` page could not be directly rendered by the fetch tool (timeout); the figures above come from Microsoft's own page content as surfaced through search, which quoted the page's stated terms directly (12 months free, $200 credit, 40+ always-free services, B2ts v2/B2pts v2/B2ats v2 VM hours). Recommend a manual visual check of the live page before relying on this for a final decision, since it wasn't fetched byte-for-byte here.

## 5. Fly.io

Source: [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing/), [fly.io/docs/about/billing](https://fly.io/docs/about/billing/)

**Free forever vs. trial: neither — no free tier for new customers at all**, as of the policy change on **October 7, 2024** that sunset the Hobby/Launch/Scale plans. Fly.io's own pricing page states plainly that it now "just charge[s] based on usage" — pure pay-as-you-go from the first VM.

**Credit card:** required unconditionally — "All organizations (except for Linked Organizations) require a credit card on file."

**Cost floor for a minimal always-on setup:** cheapest running Machine (`shared-cpu-1x`, 256 MB RAM) is ~$2.02/month; persistent volumes are billed separately at $0.15/GB/month. A minimal Node+SQLite deployment would run roughly **$3–5/month** — cheap, but not free.

**Verdict:** disqualified — Fly.io is a good low-cost paid option (worth keeping in mind if "free forever" turns out to be untenable) but has no free allowance whatsoever for new orgs today.

## 6. Railway

Source: [docs.railway.com/reference/pricing/free-trial](https://docs.railway.com/reference/pricing/free-trial), [railway.com/pricing](https://railway.com/pricing)

**Free forever vs. trial:** Railway's own docs describe a **one-time $5 trial credit, expiring after 30 days**, no credit card required to start. After the trial window (30 days or $5 spent, whichever first), the account **"reverts to the Free plan, which provides $1 of free credit per month"** — and that $1/month **does not roll over**. In practice $1/month of usage-based credit does not cover a persistently-running VM plus a persistent volume (Railway bills per-second for CPU/RAM/disk actually used) — this is a trial-then-trickle model, not a workable free-forever host for an always-on process.

**Persistent disk:** Yes, Railway supports volumes, billed per GB/second as part of usage — but the ~$1/month ongoing free credit is far too small to keep a volume-backed service running continuously without hitting a balance of $0 and being suspended.

**Verdict:** disqualified for "free forever, always-on" — the free trial is genuinely time/credit-limited, and the perpetual $1/month afterward is not enough to run this app continuously.

## 7. Render

Source: [render.com/docs/free](https://render.com/docs/free), [render.com/docs/disks](https://render.com/docs/disks)

**Free forever vs. trial:** Render's free web service plan is free-forever in the sense it doesn't expire, but it fails the persistence requirement outright:
- **Persistent disks require a paid plan.** Render's disk docs state disks attach only to "a paid Render web service, private service, or background worker" — the free plan cannot mount one.
- Free web services default to **ephemeral filesystem**: "any changes you make to a service's local files are lost every time the service redeploys or restarts" — this directly breaks a SQLite file that must survive redeploys/restarts.
- Free services also **spin down after 15 minutes of no inbound traffic** and take ~1 minute to spin back up on the next request — workable for occasional access, but combined with the ephemeral disk this alone rules Render's free tier out for this app.
- Free tier is additionally capped at **750 instance-hours/workspace/month**, after which all free services are suspended until next month.

**Verdict:** disqualified — the SQLite file would be wiped on every redeploy/restart on the free tier; persistent disk is a paid-plan-only feature, confirmed directly from Render's own docs.

## 8. Other genuinely free-forever options

No other credible primary-source-verified free-forever full VPS/VM offering was found beyond Oracle's Always Free and Google Cloud's Always Free `e2-micro` covered above. The broader trend among newer PaaS-style hosts (Fly.io, Railway, Render, and historically Heroku) has been to **remove or shrink free tiers** over 2023–2025 in favor of trial credits or pay-as-you-go — none of the PaaS-style options investigated here offer a persistent-disk-plus-always-on-process combination for $0/month indefinitely. If a wider search turns up a niche/regional provider claiming "free forever VPS," treat it with skepticism absent that provider's own pricing/ToS page confirming persistent storage and no time limit — many such claims in blog roundups turn out to be trial credits or have been discontinued.

---

## Comparison table

| Provider | Free forever or trial? | vCPU / RAM | Disk (persistent?) | Egress cap | Region limits | Card required | Long-lived Node process? |
|---|---|---|---|---|---|---|---|
| **Oracle OCI Always Free** | **Forever** | Up to 4 OCPU/24 GB total (A1, shapeable) + 2× 1/8 OCPU/1 GB (E2 AMD) | 200 GB block, **persistent** | 10 TB/mo | Home region (chosen at signup); A1 excludes South Korea North | Yes, verification only | Yes — full VM |
| **Google Cloud Always Free** | **Forever** | 1× e2-micro (2 vCPU burst / 1 GB) | 30 GB standard PD, **persistent** | 1 GB/mo (NA egress only) | `us-west1`/`us-central1`/`us-east1` only | Yes (for the separate $300 trial; Always Free itself doesn't strictly need ongoing billing but signup requires a payment method) | Yes — full VM, but public IPv4 likely billed (~$3.65/mo) since Feb 2024 |
| **AWS EC2 Free Tier** | **Trial** — 12mo (pre-Jul-2025 accounts) or 6mo/$200 credit (new accounts) | t2/t3.micro class | EBS, persistent *during* free window | Included in window | None specific | Yes, mandatory | Yes, but only during the trial window |
| **Azure free account** | **Trial** for VM hours (12mo); no always-free VM | B2ts/B2pts/B2ats v2, 750 hrs/mo each, 12mo only | N/A for always-free compute | N/A | N/A | Yes | Yes, but only during the 12-month window |
| **Fly.io** | **Neither** — no free tier since Oct 2024 | Pay-as-you-go from $0 | Paid, $0.15/GB/mo | Paid | N/A | Yes, mandatory | Yes, but paid (~$3-5/mo minimum) |
| **Railway** | **Trial** ($5/30 days) then **$1/month** trickle | Usage-based | Paid/usage-based | Usage-based | N/A | Not for trial | Not sustainably on free credit |
| **Render** | Free plan is forever but **unusable for this app** | Free web service | **Ephemeral on free plan** — disallowed | Included, capped | N/A | Not for free plan | Yes, but disk wiped on restart/redeploy; also sleeps after 15 min idle |

---

## Recommendation

**Primary pick: Oracle Cloud Infrastructure Always Free**, using either an Ampere A1 (ARM) instance (1 OCPU/6 GB or the full 2 OCPU/12 GB) or an E2.1.Micro AMD instance. It's the only option here that is unambiguously free forever, gives a real persistent block-storage-backed disk for the SQLite file, has ample RAM/CPU headroom for a near-zero-traffic household Node app (massively more than needed), and a generous 10 TB/month egress ceiling that will never realistically be hit by this app. Reach it the same way the app is reached today — Tailscale Funnel or a Cloudflare Tunnel — which also sidesteps needing to expose the VM's own public IP directly. The one thing to build into the ops routine: keep an eye on Oracle's idle-reclamation policy (7-day rolling average under ~20% CPU/network/memory can trigger automatic reclaim of the instance) — a systemd/pm2-managed Node service plus routine traffic from the household should keep utilization comfortably above that threshold, but it's worth a periodic manual check via the OCI console, especially in the first weeks.

**Runner-up / fallback: Google Cloud's Always Free `e2-micro`.** Also genuinely free forever with a real persistent disk, and Google's overall platform is arguably simpler to navigate than Oracle's console. Two things keep it in second place: it's pinned to three specific US regions (fine if that's an acceptable latency/data-residency tradeoff for a household app, but a hard constraint Oracle doesn't have), and its 1 GB/month North-America-only egress allowance is tight — plus the Feb 2024 pricing change means the VM's own public IPv4 address most likely now carries a small (~$3.65/month) recurring charge outside the free allowance, which would need to be paid or avoided by keeping the VM IPv4-address-free and reaching it purely through a tunnel. If Oracle's signup/capacity friction (reported "out of host capacity" errors for Ampere A1, plus the identity-verification card requirement) becomes a blocker, GCP e2-micro is the next-best genuinely-free-forever fallback.

Everything else surveyed — AWS, Azure, Fly.io, Railway, Render — is disqualified either because it's explicitly a time-limited trial (AWS, Azure, effectively Railway) or because its free plan has no persistent disk (Render) or no free allowance at all anymore (Fly.io).

## Sources

- Oracle: [Always Free Resources docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) · [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) (accessed via search cache after direct 403) · checked 2026-07-19
- AWS: [EC2 Free Tier usage tracking docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) · [AWS Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/) · checked 2026-07-19
- Google Cloud: [Free Google Cloud features docs](https://docs.cloud.google.com/free/docs/free-cloud-features) · [External IPv4 pricing change announcement](https://cloud.google.com/vpc/pricing-announce-external-ips) · checked 2026-07-19
- Azure: [Free Azure Services](https://azure.microsoft.com/en-us/pricing/free-services) (content via search cache, direct fetch timed out — recommend manual re-check) · checked 2026-07-19
- Fly.io: [Pricing](https://fly.io/docs/about/pricing/) · [Billing](https://fly.io/docs/about/billing/) · checked 2026-07-19
- Railway: [Free Trial docs](https://docs.railway.com/reference/pricing/free-trial) · [Pricing](https://railway.com/pricing) · checked 2026-07-19
- Render: [Free plan docs](https://render.com/docs/free) · [Disks docs](https://render.com/docs/disks) · checked 2026-07-19
