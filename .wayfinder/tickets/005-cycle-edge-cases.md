---
id: 5
title: "Grilling: cycle boundaries, mid-cycle changes, and quota edge cases"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

The core rules are set (see [Charter](001-charter.md)), but several edges will bite the salary calculation if left fuzzy. Grill Akhil through, one at a time:

- **Cycle boundary semantics:** does a cycle starting on the 10th cover the 10th through the 9th of the next month inclusive? What happens with start day 29/30/31 in short months?
- **Rate change mid-cycle:** new ₹/day applies from a chosen date (split calculation), from next cycle only, or retroactively to the whole cycle?
- **Cycle-start-day change:** allowed mid-flight? What happens to the partial period and its leave quota?
- **Worker joins/leaves mid-cycle:** first partial cycle — pro-rated quota (2 leaves even for a 5-day stub?) and which days exist for them at all. Deleting vs archiving a departed worker and their history.
- **Settlement flow:** is there an explicit "mark cycle as paid" action, or is history purely computed? (Days stay editable either way per the charter — what does the history screen show if a paid cycle's days are later edited?)
- **Quota ordering:** with default-Present and back-editing, "first 2 absences are paid" — first by calendar date, or by marking order? (Recommend calendar date; confirm.)

Output: each answer recorded; these feed the domain model ticket directly.

## Resolution

Grilled with Akhil 2026-07-15; all six edges settled:

1. **Cycle boundaries:** cycle with start day D runs from the D-th through the day before the next D-th, inclusive. Start day is restricted to **1–28** in the worker form, so the 29/30/31 short-month problem cannot occur.
2. **Rate change:** applied via an **effective-from date** (default today). Workers keep a rate history; a cycle spanning a change is split — days before the date × old rate + days from the date × new rate.
3. **Cycle-start-day change:** takes effect after the current cycle completes; one short **stub cycle** bridges to the new start day, keeping the **full 2-leave quota** (generous, simple, rare).
4. **Join/leave mid-cycle:** a new worker's first cycle is a stub from joining date to the next boundary, with the **full 2-leave quota**. Departing workers are **archived** (hidden from Today, history kept forever); their final partial cycle settles on the last working day. No hard delete.
5. **Settlement:** an explicit **"Mark paid"** action snapshots the amount and date actually paid. Days remain editable afterward; if edits change the computed total, history shows the **drift** ("computed ₹5,400 / paid ₹5,500") rather than silently rewriting.
6. **Quota ordering:** the 2 paid absences are the **earliest by calendar date** in the cycle, always recomputed live. Back-dating an absence may retroactively flip a later one from paid to unpaid — accepted as correct.

These answers are direct inputs to [Domain model: entities, schema, and the salary calculation spec](006-domain-model.md), which is now unblocked. New entities implied: per-worker **rate history** and a **payment record** per settled cycle.
