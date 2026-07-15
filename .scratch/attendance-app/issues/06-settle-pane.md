# 06 — Settle pane: breakdown, Mark paid, drift, history

**What to build:** The payday surface, per SPEC.md §1.9, §3 output shape, and §4. The hub's Settle pane shows the current window's Settlement: one row per category using CONTEXT.md language (Present / Paid leave n of quota / Unpaid leave / Off — half pay) with counts and amounts, a rate-split note when the cycle spans a Rate change, and the total — showing the exact ₹.50 figure alongside when rounding up applied. Below it, past cycles list each window with its computed total and either a "Mark paid — ₹X" button or a Payment chip ("Paid ₹X on date"). Mark paid inserts a Payment snapshot (amount = computed total at that moment, paid_on = today) and never locks anything; when a paid window's live-computed total later differs from its Payment, a Drift banner shows both figures ("computed ₹A / paid ₹B"). Amounts display with en-IN grouping and tabular numerals.

**Blocked by:** 02 — Settlement engine; 04 — Workers, cards, hub shell.

**Status:** ready-for-agent

- [ ] Current window breakdown matches the engine's output for seeded marks, including the rate-split note case
- [ ] Mark paid on a completed cycle stores the snapshot and swaps the button for the Payment chip
- [ ] Editing a day inside a paid window makes the Drift banner appear with both amounts; reverting the edit removes it
- [ ] Exact-vs-rounded line appears only when the total was rounded up
- [ ] Days remain editable after payment everywhere (no lock behaviour anywhere)
