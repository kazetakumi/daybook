import { useState } from "react";
import type { FormEvent } from "react";
import { createWorker } from "../api";

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

const DEFAULT_QUOTA = 2;

/**
 * "+ Add worker" modal (SPEC.md §4): name, optional role, ₹/day rate, Cycle
 * start day (1–28), Paid-leave quota (default 2). Creation writes the
 * Worker row plus its initial rate_period and cycle_config rows at
 * joined_on (today) — see POST /api/workers.
 */
export default function AddWorkerForm({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [rate, setRate] = useState("");
  const [cycleStartDay, setCycleStartDay] = useState("1");
  const [quota, setQuota] = useState(String(DEFAULT_QUOTA));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const rateNum = Number(rate);
    const cycleDayNum = Number(cycleStartDay);
    const quotaNum = Number(quota);

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!Number.isInteger(rateNum) || rateNum <= 0) {
      setError("Rate must be a whole number of rupees.");
      return;
    }
    if (!Number.isInteger(cycleDayNum) || cycleDayNum < 1 || cycleDayNum > 28) {
      setError("Cycle start day must be between 1 and 28.");
      return;
    }
    if (!Number.isInteger(quotaNum) || quotaNum < 0) {
      setError("Paid-leave quota must be a non-negative whole number.");
      return;
    }

    setSubmitting(true);
    try {
      const { status, body } = await createWorker({
        name: trimmedName,
        role: role.trim() || undefined,
        rate: rateNum,
        cycleStartDay: cycleDayNum,
        quota: quotaNum,
      });
      if (status !== 200) {
        setError(body.error ?? "Could not add worker.");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add worker">
      <div className="modal-card">
        <h2>Add worker</h2>
        <form className="inline-form" onSubmit={handleSubmit} style={{ borderBottom: 0 }}>
          <div>
            <label htmlFor="worker-name">Name</label>
            <input
              id="worker-name"
              autoFocus
              placeholder="e.g. Sunita"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="worker-role">Role (optional)</label>
            <input
              id="worker-role"
              placeholder="e.g. Maid, Cook"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="worker-rate">Rate (₹ per day)</label>
            <input
              id="worker-rate"
              inputMode="numeric"
              placeholder="250"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label htmlFor="worker-cycle-day">Cycle start day (1–28)</label>
            <input
              id="worker-cycle-day"
              inputMode="numeric"
              value={cycleStartDay}
              onChange={(e) => setCycleStartDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </div>
          <div>
            <label htmlFor="worker-quota">Paid leaves per cycle</label>
            <input
              id="worker-quota"
              inputMode="numeric"
              value={quota}
              onChange={(e) => setQuota(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          {error && (
            <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
              {error}
            </p>
          )}

          <div className="actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add worker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
