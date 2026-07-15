# 07 — Share settlement as text

**What to build:** The payday share from SPEC.md §6. A Share button on a settlement view builds a plain-English text block — Worker name, cycle window, one line per category (`count × rate = amount`), the total, and a `Paid ₹X on <date>` line when a Payment exists — and hands it to `navigator.share({ text })`. Where the Web Share API is unavailable, it copies the block to the clipboard and shows a "Copied" toast. English only; no image rendering.

**Blocked by:** 06 — Settle pane.

**Status:** ready-for-agent

- [ ] Shared text contains window, all four category lines with counts and amounts, and the rounded total, matching what the Settle pane displays
- [ ] Payment line included only for paid cycles
- [ ] Clipboard fallback with toast fires when navigator.share is unavailable
- [ ] Text uses CONTEXT.md terms and ₹ with en-IN formatting
