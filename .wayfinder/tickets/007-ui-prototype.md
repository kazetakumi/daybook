---
id: 7
title: "Prototype: the four core screens on a phone"
labels: [wayfinder:prototype]
status: closed
assignee: akhil
blocked-by: []
---

## Question

How should the core screens look and feel on a phone? Build a throwaway clickable prototype via `/prototype` (static HTML or Vite scratch app, fake data) covering:

- **Today:** all workers at a glance, one-tap status per worker; how the 3 states + "unmarked = Present" read visually.
- **Cycle calendar:** one worker's current cycle, day states colour-coded, tap a past day to change it; where the running totals (leaves used, amount so far) sit.
- **Settlement summary:** the payday view — breakdown lines × rate = total; must be legible enough to show the maid directly.
- **Worker management:** add/edit name, ₹/day, cycle start day.

React to it with Akhil, iterate once or twice, link the prototype here as an asset. Resolution = the settled layout/interaction choices, not pixel-perfect design.

## Resolution

Three structurally different variants built and reviewed with Akhil (2026-07-15). **Winner: Variant C — Worker-card hub**, chosen as-is.

**Settled structure:**
- **Home = one rich card per worker**: avatar, leaves-used count, running cycle amount, cycle progress bar, and inline P / L / O buttons for marking today directly on the card. "+ Add worker" below the cards.
- **Tapping a card opens that worker's hub**: header with cycle window, then a segmented control **Cycle | Settle | Details** — Cycle = tap-to-edit cycle calendar; Settle = current settlement breakdown + last cycle with "Mark paid"/drift; Details = rate, cycle, quota, joined, rate-change and archive actions.

**Settled interactions (validated live in the prototype):**
- Marking = one status per worker-day; calendar days tap-to-cycle Present → Leave → Off.
- Day states colour-coded (Present green fill, Paid leave ember fill, Unpaid leave ember outline, Off indigo fill), today ringed in accent, future days dimmed and untappable.
- Settlement breakdown rows use the CONTEXT.md language (Present / Paid leave × n of quota / Unpaid leave / Off — half pay), shows exact + rounded-up total, rate-change split note, "Mark paid" button, and a drift banner when computed ≠ paid.

**Assets:** prototype (all three variants, primary source) at [prototype/ui-variants.html](../../prototype/ui-variants.html), published for phone review at https://claude.ai/code/artifact/76d5b3f9-c700-4b50-b988-d0f62742fe77 (switch variants via the bottom rig bar or arrow keys). Variants A and B remain in the file for reference; none of this code is production — the build session rewrites it properly.
