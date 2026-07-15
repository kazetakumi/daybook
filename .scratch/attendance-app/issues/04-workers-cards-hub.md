# 04 — Workers: add, home cards, hub shell, details, archive

**What to build:** Worker lifecycle plus the app's core navigation, per SPEC.md §4 (look/feel reference: prototype/ui-variants.html Variant C — rewrite, don't copy). "+ Add worker" creates a Worker (name, optional role, ₹/day Rate, Cycle start day restricted to 1–28, Paid-leave quota default 2); creation writes the worker plus initial rate_period and cycle_config rows at joined_on. Home shows one card per active Worker: initial/avatar, name, leaves-used count, running cycle amount and window (computed via the settlement engine), and a cycle progress bar. Tapping a card opens the Worker hub: header with name and current window, segmented control Cycle | Settle | Details — Cycle and Settle panes may be placeholders (tickets 05/06 fill them); Details is complete: show rate/cycle/quota/joined; "Change rate…" with a new rate + effective-from date (appends a rate period); change cycle start day (appends a cycle config effective after the current cycle, UI notes "takes effect next cycle"); Archive with confirm (hides from home, keeps history). Mobile-first, light + dark themes, empty state pointing at "+ Add worker".

**Blocked by:** 01 — Walking skeleton; 02 — Settlement engine.

**Status:** ready-for-agent

- [ ] Add worker → card appears with correct current cycle window and running amount (all days Present so far)
- [ ] Cycle start day input rejects values outside 1–28; quota defaults to 2 and is editable
- [ ] Rate change with effective-from date takes effect in computed amounts; cycle-day change is deferred to after the current cycle
- [ ] Archive hides the worker from home after confirmation; no hard delete exists anywhere
- [ ] Hub renders with segmented control; Details pane fully functional; Cycle/Settle panes stubbed as separate components for tickets 05/06
