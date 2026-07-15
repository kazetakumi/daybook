import { describe, expect, it } from "vitest";
import {
  computeSettlement,
  cycleWindows,
  type CycleConfig,
  type Mark,
  type RatePeriod,
  type Worker,
} from "./settlement";

function worker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: 1,
    name: "Test Worker",
    role: null,
    joinedOn: "2026-01-01",
    archivedOn: null,
    paidLeavesPerCycle: 2,
    ...overrides,
  };
}

function marksOf(entries: Array<[string, Mark["state"]]>): Mark[] {
  return entries.map(([date, state]) => ({ date, state }));
}

describe("computeSettlement — SPEC §3 fixtures", () => {
  it("fixture 1: flat rate, 3 leaves (quota 2), 1 off", () => {
    const w = worker({ joinedOn: "2026-01-01", paidLeavesPerCycle: 2 });
    const rates: RatePeriod[] = [{ rateRupees: 200, effectiveFrom: "2026-01-01" }];
    const marks = marksOf([
      ["2026-06-05", "leave"],
      ["2026-06-12", "leave"],
      ["2026-06-20", "leave"],
      ["2026-06-25", "off"],
    ]);
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };

    const result = computeSettlement(w, window, marks, rates, "2026-07-01");

    expect(result.counts).toEqual({ present: 26, paidLeave: 2, unpaidLeave: 1, off: 1 });
    expect(result.amounts).toEqual({ present: 5200, paidLeave: 400, off: 100 });
    expect(result.segments).toEqual([{ rate: 200, amount: 5700 }]);
    expect(result.exact).toBe(5700);
    expect(result.total).toBe(5700);
    expect(result.open).toBe(false);
  });

  it("fixture 2: rate change mid-cycle, off + leave, two segments", () => {
    const w = worker({ joinedOn: "2026-01-01", paidLeavesPerCycle: 2 });
    const rates: RatePeriod[] = [
      { rateRupees: 175, effectiveFrom: "2026-01-01" },
      { rateRupees: 185, effectiveFrom: "2026-06-16" },
    ];
    const marks = marksOf([
      ["2026-06-10", "off"],
      ["2026-06-20", "leave"],
    ]);
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };

    const result = computeSettlement(w, window, marks, rates, "2026-07-01");

    expect(result.counts).toEqual({ present: 28, paidLeave: 1, unpaidLeave: 0, off: 1 });
    expect(result.amounts).toEqual({ present: 5040, paidLeave: 185, off: 87.5 });
    expect(result.segments).toEqual([
      { rate: 175, amount: 2537.5 },
      { rate: 185, amount: 2775 },
    ]);
    expect(result.exact).toBe(5312.5);
    expect(result.total).toBe(5313);
    expect(result.segments).toHaveLength(2);
  });

  it("fixture 3: mid-month join produces a stub window that still carries the full quota", () => {
    const w = worker({ joinedOn: "2026-06-20", paidLeavesPerCycle: 2 });
    const configs: CycleConfig[] = [{ startDay: 1, effectiveFrom: "2026-06-20" }];

    const { current } = cycleWindows(w, configs, "2026-06-25");
    expect(current.start).toBe("2026-06-20");
    expect(current.end).toBe("2026-06-30");

    // Full quota (2) applies even though the stub window is only 11 days.
    const rates: RatePeriod[] = [{ rateRupees: 100, effectiveFrom: "2026-06-20" }];
    const marks = marksOf([
      ["2026-06-22", "leave"],
      ["2026-06-24", "leave"],
      ["2026-06-26", "leave"],
    ]);
    const result = computeSettlement(w, current, marks, rates, "2026-07-01");
    expect(result.counts.paidLeave).toBe(2);
    expect(result.counts.unpaidLeave).toBe(1);
  });

  it("fixture 4: quota reflow — back-dating a Leave flips a later paid Leave to Unpaid", () => {
    const w = worker({ joinedOn: "2026-01-01", paidLeavesPerCycle: 2 });
    const rates: RatePeriod[] = [{ rateRupees: 100, effectiveFrom: "2026-01-01" }];
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };

    const before = computeSettlement(
      w,
      window,
      marksOf([
        ["2026-06-18", "leave"],
        ["2026-06-25", "leave"],
      ]),
      rates,
      "2026-07-01",
    );
    expect(before.counts).toEqual({ present: 28, paidLeave: 2, unpaidLeave: 0, off: 0 });

    const after = computeSettlement(
      w,
      window,
      marksOf([
        ["2026-06-03", "leave"],
        ["2026-06-18", "leave"],
        ["2026-06-25", "leave"],
      ]),
      rates,
      "2026-07-01",
    );
    expect(after.counts).toEqual({ present: 27, paidLeave: 2, unpaidLeave: 1, off: 0 });
    // Jun 3 and Jun 18 are now paid; Jun 25 flipped from paid to unpaid.
    expect(after.amounts.paidLeave).toBe(200);
    expect(after.total).toBe(27 * 100 + 200); // unpaid leave contributes ₹0
  });
});

describe("cycleWindows — §1.6 generation", () => {
  it("aligned join: joining exactly on the start day produces no stub", () => {
    const w = worker({ joinedOn: "2026-02-01" });
    const configs: CycleConfig[] = [{ startDay: 1, effectiveFrom: "2026-02-01" }];

    const { current } = cycleWindows(w, configs, "2026-02-15");

    expect(current).toEqual({ start: "2026-02-01", end: "2026-02-28", open: true });
  });

  it("mid-period join: joining mid-month produces a stub first window", () => {
    const w = worker({ joinedOn: "2026-06-20" });
    const configs: CycleConfig[] = [{ startDay: 1, effectiveFrom: "2026-06-20" }];

    const { current } = cycleWindows(w, configs, "2026-06-25");

    expect(current).toEqual({ start: "2026-06-20", end: "2026-06-30", open: true });
  });

  it("start-day change: current cycle completes under the old day, then a stub bridges to the new day", () => {
    const w = worker({ joinedOn: "2026-01-01" });
    // Change decided while March (old D=1) cycle is running; new config takes
    // effect only once that cycle completes, per rule §1.8 — the caller (a
    // later ticket's route) is responsible for choosing this effective_from.
    const configs: CycleConfig[] = [
      { startDay: 1, effectiveFrom: "2026-01-01" },
      { startDay: 15, effectiveFrom: "2026-04-01" },
    ];

    const seen: Array<{ start: string; end: string }> = [];
    const { current, past } = cycleWindows(w, configs, "2026-06-01");
    seen.push({ start: current.start, end: current.end });
    for (const w2 of past()) seen.push({ start: w2.start, end: w2.end });
    seen.reverse();

    expect(seen.slice(0, 4)).toEqual([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-31" }, // old cycle completes in full
      { start: "2026-04-01", end: "2026-04-14" }, // stub bridging to the 15th
    ]);
  });

  it("archived worker: the final cycle is a partial one ending on the archived date", () => {
    const w = worker({ joinedOn: "2026-01-01", archivedOn: "2026-03-15" });
    const configs: CycleConfig[] = [{ startDay: 1, effectiveFrom: "2026-01-01" }];

    const { current } = cycleWindows(w, configs, "2026-06-01");

    expect(current).toEqual({ start: "2026-03-01", end: "2026-03-15", open: false });
  });
});
