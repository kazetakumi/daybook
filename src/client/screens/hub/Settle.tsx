import { useEffect, useRef, useState } from "react";
import type { WorkerPaneProps } from "./useWorkerCycle";
import type { CycleEntry } from "../../api";
import { formatDateYear, formatRupees, formatWindow } from "../../lib/format";
import { buildShareText, shareSettlementText } from "../../lib/shareText";
import { getPayments, markPaid } from "./paymentsApi";
import type { Payment } from "./paymentsApi";
import "./Settle.css";

/**
 * Settle pane — current window's Settlement breakdown (Present / Paid leave
 * n of quota / Unpaid leave / Off — half pay; a rate-split note when the
 * cycle spans a Rate change; the total, with the exact ₹.50 figure only
 * when rounding up applied), then past cycles each with a "Mark paid — ₹X"
 * button or a Payment chip, and a Drift banner when a paid window's
 * live-computed total no longer matches its stored Payment (SPEC.md §1.9,
 * §3, §4; CONTEXT.md; docs/adr/0001).
 *
 * Payments aren't part of useWorkerCycle's contract (see that file's
 * header comment), so this pane fetches them itself via ./paymentsApi and
 * keeps its own local state — merged against `past` (and `current`) by
 * window (start, end) to decide chip vs. button per row. `refresh()` is
 * still called after a successful "Mark paid" so Home/Details/Cycle (which
 * all derive from the same worker/cycles data) stay in sync too.
 */
export default function Settle({ worker, current, past, refresh, loadMorePast, hasMorePast }: WorkerPaneProps) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  /**
   * Share (SPEC.md §6): builds the plain-English text via ../../lib/shareText
   * and hands it to navigator.share, falling back to the clipboard (with a
   * "Copied" toast) when the Web Share API isn't available. `payment` is
   * only passed for a paid Cycle, so the text's "Paid ₹X on <date>" line is
   * included exactly then.
   */
  async function handleShare(entry: CycleEntry, payment?: Payment) {
    const text = buildShareText(
      worker,
      entry.window,
      entry.settlement,
      payment ? { amount: payment.amount, paidOn: payment.paidOn } : null,
    );
    const outcome = await shareSettlementText(text);
    if (outcome === "copied") showToast("Copied");
    else if (outcome === "unavailable") showToast("Could not share this cycle.");
  }

  useEffect(() => {
    let cancelled = false;
    setPayments(null);
    setLoadError(null);
    (async () => {
      const res = await getPayments(worker.id);
      if (cancelled) return;
      if (res.status !== 200) {
        setLoadError(res.body.error ?? "Could not load payments.");
        return;
      }
      setPayments(res.body.payments);
    })();
    return () => {
      cancelled = true;
    };
  }, [worker.id]);

  const paymentByWindow = new Map((payments ?? []).map((p) => [windowKey(p), p]));

  async function handleMarkPaid(entry: CycleEntry) {
    const key = windowKey(entry.window);
    setPayingKey(key);
    setPayError(null);
    try {
      const res = await markPaid(worker.id, entry.window.start, entry.window.end);
      if (res.status !== 200) {
        setPayError(res.body.error ?? "Could not mark this cycle paid.");
        return;
      }
      const payment = res.body;
      setPayments((prev) => [...(prev ?? []).filter((p) => windowKey(p) !== key), payment]);
      refresh();
    } finally {
      setPayingKey(null);
    }
  }

  return (
    <>
      <div className="pane card">
        <SettlementBreakdown entry={current} quota={worker.paidLeavesPerCycle} />
        <button
          className="btn-secondary setl-share"
          type="button"
          onClick={() => handleShare(current)}
        >
          Share
        </button>
      </div>

      <div className="pane card">
        <h3 className="eyebrow" style={{ marginBottom: 10 }}>
          Past cycles
        </h3>

        {loadError && (
          <p className="muted" role="alert">
            {loadError}
          </p>
        )}
        {payments === null && !loadError && <p className="muted">Loading…</p>}

        {payments !== null && past.length === 0 && <p className="muted">No past cycles yet.</p>}

        {payments !== null && past.length > 0 && (
          <div className="setl-past-list">
            {past.map((entry) => {
              const key = windowKey(entry.window);
              const payment = paymentByWindow.get(key);
              const drifted = payment !== undefined && payment.amount !== entry.settlement.total;
              return (
                <div className="setl-past-row" key={key}>
                  <div className="setl-past-head">
                    <span className="muted">{formatWindow(entry.window)}</span>
                    <b className="money">{formatRupees(entry.settlement.total)}</b>
                  </div>

                  {payment ? (
                    <>
                      <span className="pay-chip">
                        Paid {formatRupees(payment.amount)} on {formatDateYear(payment.paidOn)}
                      </span>
                      {drifted && (
                        <div className="pay-drift" role="status">
                          computed {formatRupees(entry.settlement.total)} / paid{" "}
                          {formatRupees(payment.amount)}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={payingKey === key}
                      onClick={() => handleMarkPaid(entry)}
                    >
                      {payingKey === key
                        ? "Marking paid…"
                        : `Mark paid — ${formatRupees(entry.settlement.total)}`}
                    </button>
                  )}

                  <button
                    className="btn-secondary setl-share"
                    type="button"
                    onClick={() => handleShare(entry, payment)}
                  >
                    Share
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {hasMorePast && (
          <button className="setl-load-more" type="button" onClick={loadMorePast}>
            Load earlier cycles
          </button>
        )}

        {payError && (
          <p className="muted" role="alert" style={{ color: "var(--leave)", marginTop: 10 }}>
            {payError}
          </p>
        )}
      </div>

      {toast && (
        <div className="setl-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function windowKey(w: { periodStart?: string; periodEnd?: string; start?: string; end?: string }): string {
  const start = w.periodStart ?? w.start ?? "";
  const end = w.periodEnd ?? w.end ?? "";
  return `${start}|${end}`;
}

/** The breakdown rows shared visual language with CONTEXT.md's vocabulary — Present / Paid leave / Unpaid leave / Off. */
function SettlementBreakdown({ entry, quota }: { entry: CycleEntry; quota: number }) {
  const { settlement } = entry;
  const multiRate = settlement.segments.length > 1;

  return (
    <>
      <div className="setl-row">
        <span className="setl-l">
          <span className="statechip chip-present">Present</span>
          <span className="setl-n">× {settlement.counts.present}</span>
        </span>
        <b className="money">{formatRupees(settlement.amounts.present)}</b>
      </div>
      <div className="setl-row">
        <span className="setl-l">
          <span className="statechip chip-leave">Paid leave</span>
          <span className="setl-n">
            × {settlement.counts.paidLeave} of {quota}
          </span>
        </span>
        <b className="money">{formatRupees(settlement.amounts.paidLeave)}</b>
      </div>
      <div className="setl-row">
        <span className="setl-l">
          <span className="statechip chip-unpaid">Unpaid leave</span>
          <span className="setl-n">× {settlement.counts.unpaidLeave}</span>
        </span>
        <b className="money">₹0</b>
      </div>
      <div className="setl-row">
        <span className="setl-l">
          <span className="statechip chip-off">Off — half pay</span>
          <span className="setl-n">× {settlement.counts.off}</span>
        </span>
        <b className="money">{formatRupees(settlement.amounts.off)}</b>
      </div>

      {multiRate && (
        <div className="setl-seg-note">
          Rate changed during this cycle:{" "}
          {settlement.segments
            .map((s) => `${formatRupees(s.rate)}/day → ${formatRupees(s.amount)}`)
            .join(" · ")}
        </div>
      )}

      <div className="setl-total">
        <span>{settlement.open ? "So far" : "Total"}</span>
        <span className="money">{formatRupees(settlement.total)}</span>
      </div>
      {settlement.total !== settlement.exact && (
        <div className="setl-exact money">exact {formatRupees(settlement.exact)}, rounded up</div>
      )}
    </>
  );
}
