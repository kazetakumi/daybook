import { describe, expect, it } from "vitest";
import { classifyDays, nextMarkState } from "./dayStates";

describe("classifyDays", () => {
  it("matches SPEC.md §3 fixture 1 (present/paid/unpaid/off counts)", () => {
    const worker = { joinedOn: "2020-01-01", archivedOn: null, paidLeavesPerCycle: 2 };
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };
    const marks = [
      { date: "2026-06-05", state: "leave" as const },
      { date: "2026-06-12", state: "leave" as const },
      { date: "2026-06-20", state: "leave" as const },
      { date: "2026-06-25", state: "off" as const },
    ];
    const result = classifyDays(worker, window, marks, "2026-07-15");

    expect(result.size).toBe(30);
    expect(result.get("2026-06-05")).toBe("paidLeave");
    expect(result.get("2026-06-12")).toBe("paidLeave");
    expect(result.get("2026-06-20")).toBe("unpaidLeave"); // 3rd Leave, quota is 2
    expect(result.get("2026-06-25")).toBe("off");
    expect(result.get("2026-06-01")).toBe("present");

    const counts = { present: 0, paidLeave: 0, unpaidLeave: 0, off: 0 };
    for (const state of result.values()) counts[state]++;
    expect(counts).toEqual({ present: 26, paidLeave: 2, unpaidLeave: 1, off: 1 });
  });

  it("matches SPEC.md §3 fixture 4 — back-dating an earlier Leave flips a later one to Unpaid", () => {
    const worker = { joinedOn: "2020-01-01", archivedOn: null, paidLeavesPerCycle: 2 };
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };

    const before = classifyDays(
      worker,
      window,
      [
        { date: "2026-06-18", state: "leave" },
        { date: "2026-06-25", state: "leave" },
      ],
      "2026-07-15",
    );
    expect(before.get("2026-06-18")).toBe("paidLeave");
    expect(before.get("2026-06-25")).toBe("paidLeave");

    const after = classifyDays(
      worker,
      window,
      [
        { date: "2026-06-03", state: "leave" },
        { date: "2026-06-18", state: "leave" },
        { date: "2026-06-25", state: "leave" },
      ],
      "2026-07-15",
    );
    expect(after.get("2026-06-03")).toBe("paidLeave");
    expect(after.get("2026-06-18")).toBe("paidLeave");
    expect(after.get("2026-06-25")).toBe("unpaidLeave"); // flipped
  });

  it("clamps to today — days after today are absent from the map", () => {
    const worker = { joinedOn: "2020-01-01", archivedOn: null, paidLeavesPerCycle: 2 };
    const window = { start: "2026-06-01", end: "2026-06-30", open: true };
    const result = classifyDays(worker, window, [], "2026-06-10");
    expect(result.has("2026-06-10")).toBe(true);
    expect(result.has("2026-06-11")).toBe(false);
    expect(result.size).toBe(10);
  });

  it("clamps to joinedOn — days before joining are absent from the map", () => {
    const worker = { joinedOn: "2026-06-20", archivedOn: null, paidLeavesPerCycle: 2 };
    const window = { start: "2026-06-01", end: "2026-06-30", open: false };
    const result = classifyDays(worker, window, [], "2026-07-15");
    expect(result.has("2026-06-19")).toBe(false);
    expect(result.has("2026-06-20")).toBe(true);
    expect(result.size).toBe(11);
  });
});

describe("nextMarkState", () => {
  it("cycles present -> leave -> off -> present", () => {
    expect(nextMarkState("present")).toBe("leave");
    expect(nextMarkState("paidLeave")).toBe("off");
    expect(nextMarkState("unpaidLeave")).toBe("off");
    expect(nextMarkState("off")).toBe("present");
  });
});
