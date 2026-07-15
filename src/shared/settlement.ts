// Pure, I/O-free settlement math shared between server and client.
// See SPEC.md §1 (domain rules) and §3 (this module's algorithm + fixtures),
// and CONTEXT.md for the normative vocabulary these names follow.
//
// Hard rule: nothing here may depend on Node-only APIs (fs, path, process,
// ...) or DOM-only APIs (window, document, ...) — it must typecheck and run
// standalone under both tsconfig.client.json and tsconfig.server.json.

/** ISO calendar date, `YYYY-MM-DD`. Lexicographic string compare == chronological order. */
export type ISODate = string;

/** A household Worker (SPEC §1 / §2 `workers` table), joinedOn/archivedOn as ISO dates. */
export interface Worker {
  id: number;
  name: string;
  role: string | null;
  joinedOn: ISODate;
  archivedOn: ISODate | null;
  paidLeavesPerCycle: number;
}

/** One row of `rate_periods`: the Rate in whole rupees, effective from a date. */
export interface RatePeriod {
  rateRupees: number;
  effectiveFrom: ISODate;
}

/** One row of `cycle_configs`: the Cycle start day (1–28), effective from a date. */
export interface CycleConfig {
  startDay: number;
  effectiveFrom: ISODate;
}

/** A stored exception on a Worker-day. Unmarked days are Present (no row). */
export type MarkState = "leave" | "off";

export interface Mark {
  date: ISODate;
  state: MarkState;
}

/** A Cycle (or Stub cycle) window: [start, end] inclusive, `open` iff end >= today. */
export interface CycleWindow {
  start: ISODate;
  end: ISODate;
  open: boolean;
}

export interface Settlement {
  counts: {
    present: number;
    paidLeave: number;
    unpaidLeave: number;
    off: number;
  };
  amounts: {
    present: number;
    paidLeave: number;
    off: number; // unpaidLeave is always 0 and intentionally not carried here
  };
  segments: Array<{ rate: number; amount: number }>;
  exact: number;
  total: number;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers — plain string/epoch-day arithmetic, no Date-object DST traps.
// ---------------------------------------------------------------------------

function dateParts(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fromParts(y: number, m: number, d: number): ISODate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function toEpochDay(iso: ISODate): number {
  const { y, m, d } = dateParts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromEpochDay(epochDay: number): ISODate {
  const dt = new Date(epochDay * 86_400_000);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function addDays(iso: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(iso) + n);
}

function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/**
 * The first date on or after `iso` whose day-of-month is `startDay`.
 * Since Cycle start days are constrained to 1–28 (see schema.sql CHECK),
 * every month has a valid candidate — no short-month clamping needed.
 */
function onOrAfterStartDay(iso: ISODate, startDay: number): ISODate {
  const { y, m, d } = dateParts(iso);
  if (d <= startDay) return fromParts(y, m, startDay);
  const nm = m + 1 > 12 ? 1 : m + 1;
  const ny = m + 1 > 12 ? y + 1 : y;
  return fromParts(ny, nm, startDay);
}

// ---------------------------------------------------------------------------
// computeSettlement — SPEC §3
// ---------------------------------------------------------------------------

/**
 * computeSettlement(worker, cycleWindow, marks, ratePeriods, today)
 *
 * Pay days = cycleWindow ∩ [joined_on, min(today, archived_on)]. Each day's
 * state is its Mark, or Present if unmarked. The earliest `paidLeavesPerCycle`
 * Leave dates (calendar order) within that range are Paid leave; the rest are
 * Unpaid leave. Pay fraction: Present 1, Paid leave 1, Off 0.5, Unpaid leave 0.
 * Each day is priced at the Rate covering it; segments group the total by
 * Rate (more than one entry iff the Rate changed mid-cycle). The exact total
 * keeps half-rupees (from Off days); `total` rounds it up to the whole rupee.
 */
export function computeSettlement(
  worker: Worker,
  cycleWindow: CycleWindow,
  marks: Mark[],
  ratePeriods: RatePeriod[],
  today: ISODate,
): Settlement {
  const rangeStart = maxISO(cycleWindow.start, worker.joinedOn);
  const clampEnd = worker.archivedOn ? minISO(today, worker.archivedOn) : today;
  const rangeEnd = minISO(cycleWindow.end, clampEnd);

  const open = cycleWindow.end >= today;

  const emptySettlement: Settlement = {
    counts: { present: 0, paidLeave: 0, unpaidLeave: 0, off: 0 },
    amounts: { present: 0, paidLeave: 0, off: 0 },
    segments: [],
    exact: 0,
    total: 0,
    open,
  };

  if (rangeStart > rangeEnd) return emptySettlement;

  const marksByDate = new Map(marks.map((mark) => [mark.date, mark.state]));
  const sortedRates = [...ratePeriods].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));

  function rateFor(date: ISODate): number {
    let rate = sortedRates[0]?.rateRupees ?? 0;
    for (const rp of sortedRates) {
      if (rp.effectiveFrom <= date) rate = rp.rateRupees;
      else break;
    }
    return rate;
  }

  const counts = { present: 0, paidLeave: 0, unpaidLeave: 0, off: 0 };
  // Accumulate in half-rupee integer units to avoid floating-point drift;
  // convert to rupees only when producing final output.
  let presentHalf = 0;
  let paidLeaveHalf = 0;
  let offHalf = 0;
  let exactHalf = 0;
  const segmentHalvesByRate = new Map<number, number>();

  let leavesSeen = 0;
  const quota = worker.paidLeavesPerCycle;

  for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
    const mark = marksByDate.get(date);
    const rate = rateFor(date);
    let halfUnits: number;

    if (mark === "off") {
      counts.off++;
      halfUnits = rate; // rate * 0.5, in half-rupee units == rate * 1
      offHalf += halfUnits;
    } else if (mark === "leave") {
      const isPaid = leavesSeen < quota;
      leavesSeen++;
      if (isPaid) {
        counts.paidLeave++;
        halfUnits = rate * 2;
        paidLeaveHalf += halfUnits;
      } else {
        counts.unpaidLeave++;
        halfUnits = 0;
      }
    } else {
      counts.present++;
      halfUnits = rate * 2;
      presentHalf += halfUnits;
    }

    exactHalf += halfUnits;
    segmentHalvesByRate.set(rate, (segmentHalvesByRate.get(rate) ?? 0) + halfUnits);
  }

  const segments = [...segmentHalvesByRate.entries()].map(([rate, halfUnits]) => ({
    rate,
    amount: halfUnits / 2,
  }));

  const exact = exactHalf / 2;

  return {
    counts,
    amounts: {
      present: presentHalf / 2,
      paidLeave: paidLeaveHalf / 2,
      off: offHalf / 2,
    },
    segments,
    exact,
    total: Math.ceil(exact),
    open,
  };
}

// ---------------------------------------------------------------------------
// cycleWindows — SPEC §1.6
// ---------------------------------------------------------------------------

export interface CycleWindows {
  /** The current window: the one containing `today`, or — for an archived
   * Worker whose last Cycle already closed — the final partial Cycle. */
  current: CycleWindow;
  /** Past windows, most recent first. A fresh generator on every call. */
  past(): Generator<CycleWindow>;
}

/**
 * Generates windows for a single `cycle_configs` regime (one `(start_day,
 * effective_from)` row), in chronological order, from `segStart` up to and
 * including `segEnd` (inclusive), or indefinitely if `segEnd` is null.
 *
 * Per SPEC §1.6: the first window is a stub bridging `segStart` to the day
 * before the next occurrence of `startDay` — skipped (no stub) when
 * `segStart` already falls exactly on `startDay`. Every window after that is
 * a regular `startDay → day-before-next-startDay` Cycle. The final window in
 * a bounded segment is clipped to `segEnd` (a Stub cycle, e.g. an archived
 * Worker's last partial Cycle).
 */
function* generateWindowsForSegment(
  segStart: ISODate,
  segEnd: ISODate | null,
  startDay: number,
): Generator<{ start: ISODate; end: ISODate }> {
  let cursor = segStart;
  while (segEnd === null || cursor <= segEnd) {
    const candidate = onOrAfterStartDay(cursor, startDay);
    let end: ISODate;
    if (candidate === cursor) {
      const next = onOrAfterStartDay(addDays(cursor, 1), startDay);
      end = addDays(next, -1);
    } else {
      end = addDays(candidate, -1);
    }
    if (segEnd !== null && end > segEnd) end = segEnd;

    yield { start: cursor, end };

    if (segEnd !== null && end >= segEnd) break;
    cursor = addDays(end, 1);
  }
}

/**
 * cycleWindows(worker, cycleConfigs, today)
 *
 * `cycleConfigs` is the Worker's full `cycle_configs` history (one row per
 * joining / start-day change, first row's effective_from == joined_on).
 * Returns the current window (the one containing `today`, or an archived
 * Worker's final partial Cycle) plus a lazy, most-recent-first iterator over
 * every earlier window back to the Worker's joining date.
 */
export function cycleWindows(worker: Worker, cycleConfigs: CycleConfig[], today: ISODate): CycleWindows {
  if (cycleConfigs.length === 0) {
    throw new Error("cycleWindows: worker has no cycle_configs rows");
  }
  const configs = [...cycleConfigs].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));

  const all: CycleWindow[] = [];

  outer: for (let i = 0; i < configs.length; i++) {
    const config = configs[i]!;
    const segStart = config.effectiveFrom;
    const isLastSegment = i === configs.length - 1;
    const nextConfig = configs[i + 1];
    const segEnd = isLastSegment ? worker.archivedOn : addDays(nextConfig!.effectiveFrom, -1);

    for (const w of generateWindowsForSegment(segStart, segEnd, config.startDay)) {
      all.push({ start: w.start, end: w.end, open: w.end >= today });
      // Stop as soon as we've reached the window containing `today` — later
      // segments (e.g. an already-recorded future start-day change) don't
      // exist yet as far as "current" is concerned.
      if (w.end >= today) break outer;
    }
  }

  const current = all[all.length - 1];
  if (!current) {
    throw new Error("cycleWindows: no windows could be generated");
  }

  const pastWindows = all.slice(0, -1).reverse();

  return {
    current,
    *past() {
      yield* pastWindows;
    },
  };
}
