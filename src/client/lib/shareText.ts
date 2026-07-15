// Payday share (SPEC.md §6, ticket 07). Builds the plain-English text block
// for a settled/settling Cycle and hands it off via navigator.share, with a
// clipboard fallback when the Web Share API is unsupported. Lives here
// (rather than in screens/hub/) because it's generic formatting + delivery
// logic with no dependency on WorkerPaneProps — Settle.tsx (ticket 06) is
// its only caller today but nothing here is Settle-specific.
//
// buildShareText is pure (no navigator/DOM access) so it's directly
// unit-testable against SPEC §3's fixtures; shareSettlementText is the thin
// impure wrapper that talks to navigator.share / navigator.clipboard.

import type { Settlement } from "../../shared/settlement";
import { formatDateYear, formatRupees, formatWindow } from "./format";

/** The subset of Worker this module needs. */
export interface ShareWorker {
  name: string;
}

/** The subset of a Payment this module needs (see paymentsApi.ts's Payment). */
export interface SharePayment {
  amount: number;
  paidOn: string;
}

/**
 * Builds the plain-English payday share text for one Worker-Cycle
 * Settlement: worker name + cycle window, one `count × rate = amount` line
 * per category (Present / Paid leave / Unpaid leave / Off — CONTEXT.md's
 * vocabulary, in that order), the rounded total, and a trailing
 * `Paid ₹X on <date>` line only when `payment` is supplied (a paid Cycle).
 *
 * Per-category "rate" is derived as amount ÷ count (the effective per-day
 * rate paid for that category — the full Rate for Present/Paid leave, half
 * for Off) rather than carried separately, since `Settlement` only exposes
 * amounts per category and rate per segment, not both together. Unpaid
 * leave's rate is always ₹0 by definition (SPEC §3), shown as such rather
 * than omitted, since the category line format is uniform across all four
 * rows. When the Rate changed mid-cycle (`segments.length > 1`), that
 * per-category division is a blended average across the two Rates rather
 * than an exact figure — an extra line (mirroring the Settle pane's own
 * "Rate changed during this cycle" note) is appended so the blend is never
 * silently presented as if it were a single Rate. The total line reads
 * "So far" instead of "Total" for a still-open Cycle, matching the pane.
 */
export function buildShareText(
  worker: ShareWorker,
  window: { start: string; end: string },
  settlement: Settlement,
  payment?: SharePayment | null,
): string {
  const perUnitRate = (amount: number, count: number): number => (count > 0 ? amount / count : 0);

  const categoryLine = (label: string, count: number, amount: number): string =>
    `${label}: ${count} × ${formatRupees(perUnitRate(amount, count))} = ${formatRupees(amount)}`;

  const lines = [
    `${worker.name} — ${formatWindow(window)}`,
    "",
    categoryLine("Present", settlement.counts.present, settlement.amounts.present),
    categoryLine("Paid leave", settlement.counts.paidLeave, settlement.amounts.paidLeave),
    categoryLine("Unpaid leave", settlement.counts.unpaidLeave, 0),
    categoryLine("Off", settlement.counts.off, settlement.amounts.off),
  ];

  if (settlement.segments.length > 1) {
    const segmentNote = settlement.segments
      .map((s) => `${formatRupees(s.rate)}/day → ${formatRupees(s.amount)}`)
      .join(" · ");
    lines.push(`(Rate changed during this cycle: ${segmentNote} — category rates above are blended)`);
  }

  lines.push("", `${settlement.open ? "So far" : "Total"}: ${formatRupees(settlement.total)}`);

  if (payment) {
    lines.push(`Paid ${formatRupees(payment.amount)} on ${formatDateYear(payment.paidOn)}`);
  }

  return lines.join("\n");
}

/** What `shareSettlementText` actually did, so the caller can decide whether to surface a "Copied" toast. */
export type ShareOutcome = "shared" | "copied" | "unavailable";

/**
 * Hands `text` to the Web Share API (`navigator.share`) when present;
 * otherwise falls back to `navigator.clipboard.writeText` (SPEC.md §6).
 * Returns which path fired — "unavailable" only if neither API exists (or
 * the clipboard write itself throws), which the caller should surface as an
 * error rather than a silent no-op.
 *
 * The user dismissing the native share sheet raises `AbortError`; that's
 * treated as a completed share, not a failure to fall back from.
 */
export async function shareSettlementText(text: string): Promise<ShareOutcome> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared";
      // Any other failure (permission denied, no share targets, ...) falls
      // through to the clipboard below.
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return "copied";
    } catch {
      return "unavailable";
    }
  }

  return "unavailable";
}
