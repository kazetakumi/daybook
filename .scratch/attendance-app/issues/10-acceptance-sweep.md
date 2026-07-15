# 10 — Acceptance sweep

**What to build:** Nothing new — verification. Work through SPEC.md §11's acceptance checklist end to end against the running app, exercising every flow like the household will (add workers, mark days across cycle boundaries, rate change mid-cycle, cycle-day change, archive, settle, drift, share, backup, PIN, phone access). Fix small gaps found along the way; anything larger becomes a new ticket rather than scope creep here. Confirm the unit suite is green and the CONTEXT.md vocabulary is used consistently in visible UI copy.

**Blocked by:** 01–09 (everything).

**Status:** ready-for-agent

- [ ] Every SPEC §11 checklist item verified and ticked, with a short evidence note per item
- [ ] Full test suite green
- [ ] UI copy audited against CONTEXT.md (no "absent", "holiday", "delete worker", etc.)
- [ ] Residual issues filed as new tickets, not silently fixed-in-place if non-trivial
