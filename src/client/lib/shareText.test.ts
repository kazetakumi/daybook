import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settlement } from "../../shared/settlement";
import { buildShareText, shareSettlementText } from "./shareText";

// Same Settlement shape as SPEC.md §3 fixture 1 / settlement.test.ts's
// "fixture 1" (Rate ₹200, window Jun 1–30, Leaves Jun 5/12/20, Off Jun 25,
// quota 2): present 26 = ₹5,200; paid leave 2 = ₹400; unpaid 1 = ₹0;
// off 1 = ₹100; total ₹5,700.
function fixture1Settlement(): Settlement {
  return {
    counts: { present: 26, paidLeave: 2, unpaidLeave: 1, off: 1 },
    amounts: { present: 5200, paidLeave: 400, off: 100 },
    segments: [{ rate: 200, amount: 5700 }],
    exact: 5700,
    total: 5700,
    open: false,
  };
}

const window = { start: "2026-06-01", end: "2026-06-30" };
const worker = { name: "Test Worker" };

describe("buildShareText", () => {
  it("matches SPEC §3 fixture 1: window, all four category lines, and the rounded total", () => {
    const text = buildShareText(worker, window, fixture1Settlement());

    expect(text).toBe(
      [
        "Test Worker — Jun 1 – Jun 30",
        "",
        "Present: 26 × ₹200 = ₹5,200",
        "Paid leave: 2 × ₹200 = ₹400",
        "Unpaid leave: 1 × ₹0 = ₹0",
        "Off: 1 × ₹100 = ₹100",
        "",
        "Total: ₹5,700",
      ].join("\n"),
    );
  });

  it("omits the Paid line for an unpaid (unsettled) cycle", () => {
    const text = buildShareText(worker, window, fixture1Settlement());
    expect(text).not.toContain("Paid ₹");
  });

  it("appends a Paid ₹X on <date> line only when a Payment is supplied", () => {
    const text = buildShareText(worker, window, fixture1Settlement(), {
      amount: 5700,
      paidOn: "2026-07-01",
    });

    expect(text.endsWith("Paid ₹5,700 on Jul 1, 2026")).toBe(true);
  });

  it("uses en-IN grouping for amounts", () => {
    const settlement: Settlement = {
      counts: { present: 30, paidLeave: 0, unpaidLeave: 0, off: 0 },
      amounts: { present: 12345, paidLeave: 0, off: 0 },
      segments: [{ rate: 411.5, amount: 12345 }],
      exact: 12345,
      total: 12345,
      open: false,
    };
    const text = buildShareText(worker, window, settlement);
    expect(text).toContain("Total: ₹12,345");
  });

  it("shows ₹0 for Unpaid leave rather than skipping the line, per the category-line format", () => {
    const text = buildShareText(worker, window, fixture1Settlement());
    expect(text).toContain("Unpaid leave: 1 × ₹0 = ₹0");
  });

  it("labels the total 'So far' for a still-open cycle, matching the Settle pane", () => {
    const open = { ...fixture1Settlement(), open: true };
    const closed = { ...fixture1Settlement(), open: false };

    expect(buildShareText(worker, window, open)).toContain("So far: ₹5,700");
    expect(buildShareText(worker, window, open)).not.toContain("Total:");
    expect(buildShareText(worker, window, closed)).toContain("Total: ₹5,700");
    expect(buildShareText(worker, window, closed)).not.toContain("So far:");
  });

  // SPEC §3 fixture 2: Rate ₹175 → ₹185 effective Jun 16, Off Jun 10, Leave
  // Jun 20, quota 2 → two segments. This fixture's blended Present rate
  // happens to average out clean (28 × ₹180 = ₹5,040); it exists mainly to
  // pin the segment note's exact wording against a real Settlement.
  it("appends a rate-changed segment note (mirroring the Settle pane's) for a multi-rate cycle", () => {
    const settlement: Settlement = {
      counts: { present: 28, paidLeave: 1, unpaidLeave: 0, off: 1 },
      amounts: { present: 5040, paidLeave: 185, off: 87.5 },
      segments: [
        { rate: 175, amount: 2537.5 },
        { rate: 185, amount: 2775 },
      ],
      exact: 5312.5,
      total: 5313,
      open: false,
    };

    const text = buildShareText(worker, window, settlement);

    expect(text).toContain("Present: 28 × ₹180 = ₹5,040");
    expect(text).toContain(
      "(Rate changed during this cycle: ₹175/day → ₹2,537.5 · ₹185/day → ₹2,775 — category rates above are blended)",
    );
    expect(text).toContain("Total: ₹5,313");
  });

  // A rate split chosen so the blended average does NOT land on a clean
  // whole rupee, to confirm the segment note is present precisely to
  // explain that fuzziness rather than only in the lucky-average case above.
  it("still appends the segment note when the blended rate is not a round number", () => {
    const settlement: Settlement = {
      counts: { present: 3, paidLeave: 0, unpaidLeave: 0, off: 0 },
      amounts: { present: 550, paidLeave: 0, off: 0 }, // 2×175 + 1×200 = 550, /3 = 183.33...
      segments: [
        { rate: 175, amount: 350 },
        { rate: 200, amount: 200 },
      ],
      exact: 550,
      total: 550,
      open: false,
    };

    const text = buildShareText(worker, window, settlement);

    expect(text).toContain("Present: 3 × ₹183.33 = ₹550");
    expect(text).toContain("Rate changed during this cycle");
    expect(text).toContain("blended");
  });
});

describe("shareSettlementText", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  function stubNavigator(nav: Partial<Navigator>) {
    Object.defineProperty(globalThis, "navigator", {
      value: nav,
      configurable: true,
      writable: true,
    });
  }

  it("uses navigator.share when available and reports 'shared'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });

    const outcome = await shareSettlementText("hello");

    expect(share).toHaveBeenCalledWith({ text: "hello" });
    expect(outcome).toBe("shared");
  });

  it("treats a dismissed share sheet (AbortError) as 'shared', not a fallback trigger", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const share = vi.fn().mockRejectedValue(abortError);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as unknown as Clipboard });

    const outcome = await shareSettlementText("hello");

    expect(outcome).toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard and reports 'copied' when navigator.share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });

    const outcome = await shareSettlementText("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(outcome).toBe("copied");
  });

  it("falls back to clipboard when navigator.share rejects for a non-abort reason", async () => {
    const share = vi.fn().mockRejectedValue(new Error("no share targets"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } as unknown as Clipboard });

    const outcome = await shareSettlementText("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(outcome).toBe("copied");
  });

  it("reports 'unavailable' when neither navigator.share nor navigator.clipboard exist", async () => {
    stubNavigator({});

    const outcome = await shareSettlementText("hello");

    expect(outcome).toBe("unavailable");
  });
});
