import { useCallback, useEffect, useState } from "react";
import { getHome } from "../api";
import type { HomeCard } from "../api";
import AddWorkerForm from "./AddWorkerForm";
import { formatDateYear, formatRupees, formatWindow } from "../lib/format";
import { todayISO } from "../lib/date";
import MarkTodayButtons from "./hub/MarkTodayButtons";
import { getMarks, putMark } from "./hub/marksApi";
import type { DayMarkState } from "./hub/marksApi";

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
 * "x of N leaves used", running cycle amount + window, progress bar, and
 * inline P/L/O "mark today" buttons; gear → Settings; "+ Add worker"
 * beneath; empty state points at "+ Add worker".
 *
 * The P/L/O buttons (ticket 05, "Marking days") mark *today* directly via
 * PUT /api/marks/:workerId/today — tapping the currently-active state again
 * returns the day to Present. Each successful mark re-fetches GET /api/home
 * so the card's amount and "x of N leaves used" recompute live (server-side,
 * via computeSettlement) without a page reload.
 */
export default function HomeScreen({ onOpenWorker, onOpenSettings }: Props) {
  const [cards, setCards] = useState<HomeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // Today's mark state per Worker, for highlighting the active P/L/O button.
  // 'present' (the default) covers both "no mark row" and "not loaded yet" —
  // Present is always a safe fallback since it's what an unmarked day is.
  const [todayMarks, setTodayMarks] = useState<Record<number, DayMarkState>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    getHome().then(({ status, body }) => {
      if (status !== 200) {
        setError(body.error ?? "Could not load workers.");
        return;
      }
      setCards(body.workers);

      const today = todayISO();
      Promise.all(
        body.workers.map((w) =>
          getMarks(w.id, today, today).then(({ status: s, body: b }) => [
            w.id,
            s === 200 && b.marks[0] ? (b.marks[0].state as DayMarkState) : "present",
          ] as const),
        ),
      ).then((entries) => {
        setTodayMarks(Object.fromEntries(entries));
      });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markToday(workerId: number, target: DayMarkState) {
    const current = todayMarks[workerId] ?? "present";
    const next = current === target ? "present" : target;
    setBusyId(workerId);
    try {
      const { status, body } = await putMark(workerId, todayISO(), next);
      if (status !== 200) {
        setError(body.error ?? "Could not update today.");
        return;
      }
      setTodayMarks((prev) => ({ ...prev, [workerId]: next }));
      load(); // re-fetch amounts/leavesUsed so the card recomputes live
    } finally {
      setBusyId(null);
    }
  }

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
          <div key={card.id} className="card worker-card">
            <div
              className="worker-card-tap"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => onOpenWorker(card.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenWorker(card.id);
                }
              }}
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
            </div>
            <MarkTodayButtons
              current={todayMarks[card.id] ?? "present"}
              busy={busyId === card.id}
              onMark={(target) => markToday(card.id, target)}
            />
          </div>
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
