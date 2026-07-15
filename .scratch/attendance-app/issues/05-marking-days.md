# 05 — Marking days: today buttons + cycle calendar

**What to build:** Attendance marking, per SPEC.md §1.3–1.5 and §4. On each home card, inline P / L / O buttons mark *today* for that Worker (tapping the active state again returns the day to Present, which deletes the Mark — exceptions-only storage via `PUT` of state `present`). The hub's Cycle pane becomes a Monday-first calendar grid of the current window: days colour-coded Present / Paid leave / Unpaid leave (outline) / Off, today ringed, days after today dimmed and untappable, days outside the window hidden; tapping a day cycles Present → Leave → Off → Present; a legend sits beneath; the user can step back through previous windows. Every change recomputes live — leaves-used counts, card amounts, and paid/unpaid colouring all update immediately (quota reflow from back-dating must be visible).

**Blocked by:** 02 — Settlement engine; 04 — Workers, cards, hub shell.

**Status:** ready-for-agent

- [ ] Marking today from a home card updates that card's amount and leaves-used without reload
- [ ] Calendar tap cycles the three states; marking back to Present removes the row (verify no marks rows for Present days)
- [ ] Paid vs Unpaid leave colouring follows earliest-by-date quota; back-dating a Leave visibly flips a later one to Unpaid
- [ ] Future days and out-of-window days cannot be marked; today is visually ringed
- [ ] Previous cycle windows are browsable and their past days editable
