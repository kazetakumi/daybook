import { useCallback, useEffect, useState } from "react";
import { getHome } from "../api";
import type { HomeCard } from "../api";
import AddWorkerForm from "./AddWorkerForm";
import { formatDateYear, formatRupees, formatWindow } from "../lib/format";
import { todayISO } from "../lib/date";

type Props = {
  onOpenWorker: (workerId: number) => void;
  onOpenSettings: () => void;
};

const AVATAR_PALETTE = ["#C75B12", "#4C63C7", "#1F8A4C", "#7A5000", "#8C4C9E", "#0E7C86"];

function avatarColor(id: number): string {
  return AVATAR_PALETTE[((id % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length]!;
}

/**
 * Home (SPEC.md §4): one card per active Worker — avatar/initial, name,
 * "x of N leaves used", running cycle amount + window, progress bar; gear
 * → Settings; "+ Add worker" beneath; empty state points at "+ Add worker".
 *
 * Deliberately does NOT include the inline Present/Leave/Off "mark today"
 * buttons from the SPEC's card sketch — that's ticket 05 ("Marking days"),
 * which adds them to the card below the progress bar without needing to
 * touch this file's data flow (it can call GET /api/home itself, or extend
 * this component directly).
 */
export default function HomeScreen({ onOpenWorker, onOpenSettings }: Props) {
  const [cards, setCards] = useState<HomeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getHome().then(({ status, body }) => {
      if (status !== 200) {
        setError(body.error ?? "Could not load workers.");
        return;
      }
      setCards(body.workers);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen">
      <div className="top-row">
        <div>
          <p className="eyebrow">Household</p>
          <h1>Workers</h1>
          <p className="muted">{formatDateYear(todayISO())}</p>
        </div>
        <button className="icon-btn" type="button" aria-label="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
          {error}
        </p>
      )}

      {cards === null && !error && <p className="muted">Loading…</p>}

      {cards !== null && cards.length === 0 && (
        <div className="empty-state">
          <p>No workers yet.</p>
          <p className="muted">Add your first household worker to start tracking attendance.</p>
        </div>
      )}

      {cards !== null &&
        cards.map((card) => (
          <button
            key={card.id}
            className="card worker-card"
            type="button"
            onClick={() => onOpenWorker(card.id)}
          >
            <div className="head">
              <span className="avatar" style={{ background: avatarColor(card.id) }}>
                {card.avatarInitial}
              </span>
              <span className="who">
                <b>{card.name}</b>
                <span className="sub">
                  {card.role ? `${card.role} · ` : ""}
                  {card.leavesUsed} of {card.paidLeavesPerCycle} leaves used
                </span>
              </span>
              <span className="amount">
                <span className="value money">{formatRupees(card.amount)}</span>
                <br />
                <span className="caption">so far · {formatWindow(card.window)}</span>
              </span>
            </div>
            <div className="progress-track">
              <span
                className="progress-fill"
                style={{ width: `${Math.round(card.progress * 100)}%` }}
              />
            </div>
          </button>
        ))}

      <button className="add-worker-btn" type="button" onClick={() => setShowAddForm(true)}>
        + Add worker
      </button>

      {showAddForm && (
        <AddWorkerForm
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}
