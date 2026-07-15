# 02 — Settlement engine (pure functions + fixtures)

**What to build:** The salary math as pure, I/O-free TypeScript shared between server and client: `computeSettlement` and `cycleWindows`, implementing SPEC.md §1 rules and §3 exactly, using the CONTEXT.md vocabulary (Present, Leave, Paid/Unpaid leave, Off, Cycle, Stub cycle, Settlement).

Key behaviours: exceptions-only marks (unmarked = Present); earliest-by-date Leaves up to the per-worker quota are Paid; Off = half Rate, never consumes quota; rate periods split a spanning cycle into segments; days clamped to joined/archived and to today; exact ₹.50 kept internally, cycle total rounds UP to the whole rupee. Cycle generation from config rows `(start_day 1–28, effective_from)`: stub from effective_from to the day before the next start day (skipped if aligned), then regular cycles — one rule covering joining and start-day changes.

**Blocked by:** 01 — Walking skeleton.

**Status:** ready-for-agent

- [ ] All four SPEC §3 fixtures pass as unit tests, asserting counts, amounts, segments, exact, and total
- [ ] Fixture 4 (quota reflow) proves back-dating a Leave flips a later paid Leave to Unpaid
- [ ] `cycleWindows` covers: aligned join (no stub), mid-period join (stub), start-day change (completes current cycle, then stub), archived worker (final partial cycle)
- [ ] Module imports cleanly from both server and client code with no Node-only or DOM dependencies
