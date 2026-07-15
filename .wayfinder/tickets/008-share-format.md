---
id: 8
title: "Decision: shareable settlement summary — format and mechanism"
labels: [wayfinder:grilling]
status: closed
assignee: akhil
blocked-by: []
---

## Question

At payday Akhil wants to share/show the cycle breakdown. Decide:

- Format: plain text (pastes cleanly into WhatsApp, trivially cheap) vs. an image rendered from the settlement view (prettier, language-independent) — and does the maid receive it on her phone, or is it just shown on Akhil's screen?
- Mechanism: Web Share API from the browser (support on Android Chrome/iOS Safari for text and files), vs. copy-to-clipboard, vs. just screenshotting the settlement screen (which would make this feature free).
- Language: does the summary need to be in a language other than English for the maid to read it?

Small ticket; a recommendation put to Akhil resolves it.

## Resolution

Decided with Akhil 2026-07-15: **plain text, English only, via the native share sheet**. A "Share" button on the settlement view builds a text block (worker name, cycle window, one line per category with count × rate = amount, total, and the payment line if paid) and calls `navigator.share({ text })`; if unavailable, falls back to copy-to-clipboard with a "Copied" toast. No image rendering; a screenshot covers the visual case. Example block recorded in the ticket discussion; exact template to be fixed in SPEC.md using the CONTEXT.md terms.
