// Per-day state classification for the Cycle calendar. computeSettlement
// (src/shared/settlement.ts) is the source of truth for aggregate counts and
// amounts, but it doesn't expose which *individual* days are Paid vs Unpaid
// leave — only the totals. The Cycle pane needs that per-day answer to
// colour cells, so this mirrors computeSettlement's clamp + earliest-N-paid
// algorithm exactly (SPEC.md §1.5, §3). Keep this in lockstep with
// settlement.ts's loop — a drift here would show calendar colours that
// disagree with the amount on the same screen.

import type { CycleWindow, ISODate, MarkState } from "../../../shared/settlement";

export type DayState = "present" | "paidLeave" | "unpaidLeave" | "off";

/** The subset of Worker fields classifyDays needs — WorkerDetail (api.ts) satisfies this structurally. */
export interface WorkerForClassification {
  joinedOn: ISODate;
  archivedOn: ISODate | null;
  paidLeavesPerCycle: number;
}

function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

function addDays(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The Present/Paid-leave/Unpaid-leave/Off classification of every day in
 * `[max(window.start, joinedOn), min(window.end, today, archivedOn)]` —
 * i.e. exactly the range computeSettlement sums over. Days outside that
 * range (future, pre-joining, post-archive) are simply absent from the map;
 * the caller decides how to render those (dimmed/disabled).
 */
export function classifyDays(
  worker: WorkerForClassification,
  window: CycleWindow,
  marks: Array<{ date: ISODate; state: MarkState }>,
  today: ISODate,
): Map<ISODate, DayState> {
  const rangeStart = maxISO(window.start, worker.joinedOn);
  const clampEnd = worker.archivedOn ? minISO(today, worker.archivedOn) : today;
  const rangeEnd = minISO(window.end, clampEnd);

  const result = new Map<ISODate, DayState>();
  if (rangeStart > rangeEnd) return result;

  const marksByDate = new Map(marks.map((m) => [m.date, m.state]));
  const quota = worker.paidLeavesPerCycle;
  let leavesSeen = 0;

  for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
    const mark = marksByDate.get(date);
    if (mark === "off") {
      result.set(date, "off");
    } else if (mark === "leave") {
      const isPaid = leavesSeen < quota;
      leavesSeen++;
      result.set(date, isPaid ? "paidLeave" : "unpaidLeave");
    } else {
      result.set(date, "present");
    }
  }

  return result;
}

/** Present → Leave → Off → Present, per SPEC.md §4's calendar tap-cycle. */
export function nextMarkState(current: DayState): "present" | "leave" | "off" {
  if (current === "present") return "leave";
  if (current === "off") return "present";
  return "off"; // paidLeave or unpaidLeave — both are a stored 'leave' Mark
}
