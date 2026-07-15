import { useState } from "react";
import type { FormEvent } from "react";
import type { WorkerPaneProps } from "./useWorkerCycle";
import { changeCycleConfig, changeRate, updateWorker } from "../../api";
import { addDaysISO, todayISO } from "../../lib/date";
import { formatDateYear, formatRupees } from "../../lib/format";

type Props = WorkerPaneProps & {
  /** Called once the worker has been successfully archived, so the caller can navigate back to Home (an archived Worker no longer appears there). */
  onArchived: () => void;
};

type Panel = "rate" | "cycle" | "quota" | null;

/**
 * Details pane — rate (with "Change rate…"), Cycle start day (with a
 * "takes effect next cycle" note), Paid-leave quota, joined date, and
 * Archive worker with a confirm dialog (SPEC.md §4). Fully functional —
 * this is this ticket's pane (Cycle/Settle are stubs for tickets 05/06).
 */
export default function Details({ worker, current, refresh, onArchived }: Props) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rateValue, setRateValue] = useState(String(worker.currentRate));
  const [rateEffective, setRateEffective] = useState(todayISO());
  const [cycleDayValue, setCycleDayValue] = useState(String(worker.currentCycleStartDay));
  const [quotaValue, setQuotaValue] = useState(String(worker.paidLeavesPerCycle));
  const [cycleConfirmation, setCycleConfirmation] = useState<string | null>(null);

  const previewNextCycleStart = addDaysISO(current.window.end, 1);

  // Fields are only seeded from `worker` on mount (useState's initial value
  // is ignored on re-render), so re-derive them each time a panel opens —
  // otherwise a second "Change rate…" after a successful save would show
  // the stale pre-save value instead of the worker's new current rate.
  function togglePanel(panel: Panel) {
    setError(null);
    setCycleConfirmation(null);
    const next = openPanel === panel ? null : panel;
    if (next === "rate") {
      setRateValue(String(worker.currentRate));
      setRateEffective(todayISO());
    } else if (next === "cycle") {
      setCycleDayValue(String(worker.currentCycleStartDay));
    } else if (next === "quota") {
      setQuotaValue(String(worker.paidLeavesPerCycle));
    }
    setOpenPanel(next);
  }

  async function submitRate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = Number(rateValue);
    if (!Number.isInteger(rate) || rate <= 0) {
      setError("Rate must be a whole number of rupees.");
      return;
    }
    if (!rateEffective) {
      setError("Pick an effective-from date.");
      return;
    }

    setBusy(true);
    try {
      const { status, body } = await changeRate(worker.id, rate, rateEffective);
      if (status !== 200) {
        setError(body.error ?? "Could not update the rate.");
        return;
      }
      setOpenPanel(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitCycleDay(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const day = Number(cycleDayValue);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setError("Cycle start day must be between 1 and 28.");
      return;
    }

    setBusy(true);
    try {
      const { status, body } = await changeCycleConfig(worker.id, day);
      if (status !== 200) {
        setError(body.error ?? "Could not update the cycle start day.");
        return;
      }
      setCycleConfirmation(
        `Saved. Takes effect from ${formatDateYear(body.effectiveFrom)} — the current cycle finishes first.`,
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitQuota(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const quota = Number(quotaValue);
    if (!Number.isInteger(quota) || quota < 0) {
      setError("Paid-leave quota must be a non-negative whole number.");
      return;
    }

    setBusy(true);
    try {
      const { status, body } = await updateWorker(worker.id, { quota });
      if (status !== 200) {
        setError(body.error ?? "Could not update the quota.");
        return;
      }
      setOpenPanel(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doArchive() {
    setBusy(true);
    setError(null);
    try {
      const { status, body } = await updateWorker(worker.id, { archive: true });
      if (status !== 200) {
        setError(body.error ?? "Could not archive this worker.");
        setBusy(false);
        return;
      }
      setConfirmArchive(false);
      onArchived();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pane card">
      <div className="kv-row">
        <span className="k">Rate</span>
        <b className="money">{formatRupees(worker.currentRate)} / day</b>
      </div>
      <div className="kv-row">
        <span className="k" />
        <button className="btn-secondary" type="button" onClick={() => togglePanel("rate")}>
          {openPanel === "rate" ? "Cancel" : "Change rate…"}
        </button>
      </div>
      {openPanel === "rate" && (
        <form className="inline-form" onSubmit={submitRate}>
          <div>
            <label htmlFor="rate-value">New rate (₹ / day)</label>
            <input
              id="rate-value"
              inputMode="numeric"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label htmlFor="rate-effective">Effective from</label>
            <input
              id="rate-effective"
              type="date"
              min={worker.joinedOn}
              value={rateEffective}
              onChange={(e) => setRateEffective(e.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              Save rate
            </button>
          </div>
        </form>
      )}

      <div className="kv-row">
        <span className="k">Cycle</span>
        <b>Day {worker.currentCycleStartDay}</b>
      </div>
      <div className="kv-row">
        <span className="k" />
        <button className="btn-secondary" type="button" onClick={() => togglePanel("cycle")}>
          {openPanel === "cycle" ? "Cancel" : "Change cycle start day…"}
        </button>
      </div>
      {openPanel === "cycle" && (
        <form className="inline-form" onSubmit={submitCycleDay}>
          <div>
            <label htmlFor="cycle-day">Cycle start day (1–28)</label>
            <input
              id="cycle-day"
              inputMode="numeric"
              value={cycleDayValue}
              onChange={(e) => setCycleDayValue(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </div>
          <p className="hint">
            Takes effect next cycle — from {formatDateYear(previewNextCycleStart)}. The cycle already in
            progress finishes on the old schedule.
          </p>
          <div className="actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              Save cycle start day
            </button>
          </div>
        </form>
      )}
      {cycleConfirmation && <p className="muted">{cycleConfirmation}</p>}

      <div className="kv-row">
        <span className="k">Paid-leave quota</span>
        <b>{worker.paidLeavesPerCycle}</b>
      </div>
      <div className="kv-row">
        <span className="k" />
        <button className="btn-secondary" type="button" onClick={() => togglePanel("quota")}>
          {openPanel === "quota" ? "Cancel" : "Edit quota…"}
        </button>
      </div>
      {openPanel === "quota" && (
        <form className="inline-form" onSubmit={submitQuota}>
          <div>
            <label htmlFor="quota-value">Paid leaves per cycle</label>
            <input
              id="quota-value"
              inputMode="numeric"
              value={quotaValue}
              onChange={(e) => setQuotaValue(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              Save quota
            </button>
          </div>
        </form>
      )}

      <div className="kv-row">
        <span className="k">Joined</span>
        <b>{formatDateYear(worker.joinedOn)}</b>
      </div>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
          {error}
        </p>
      )}

      <div className="kv-row">
        <button className="btn-danger" type="button" onClick={() => setConfirmArchive(true)}>
          Archive worker
        </button>
      </div>

      {confirmArchive && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm archive">
          <div className="modal-card">
            <h2>Archive {worker.name}?</h2>
            <p className="muted">
              This hides {worker.name} from Home and daily marking. Their history and Payments are kept
              forever — nothing is deleted, and this can't be undone from here.
            </p>
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setConfirmArchive(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn-danger" type="button" onClick={doArchive} disabled={busy}>
                {busy ? "Archiving…" : "Archive worker"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
