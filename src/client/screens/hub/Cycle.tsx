import { useEffect, useMemo, useState } from "react";
import type { WorkerPaneProps } from "./useWorkerCycle";
import type { CycleWindow, ISODate } from "../../../shared/settlement";
import { getMarks, putMark } from "./marksApi";
import type { MarkRow } from "./marksApi";
import { classifyDays, nextMarkState } from "./dayStates";
import type { DayState } from "./dayStates";
import { formatWindow } from "../../lib/format";
import { todayISO } from "../../lib/date";
import "./cycle.css";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toEpochDay(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

function fromEpochDay(epochDay: number): ISODate {
  const dt = new Date(epochDay * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Monday-first weekday index (Mon=0..Sun=6) for an epoch day. Epoch day 0 (1970-01-01) was a Thursday (index 3). */
function mondayIndex(epochDay: number): number {
  return (((epochDay + 3) % 7) + 7) % 7;
}

type Cell = { date: ISODate | null };

/** Monday-first grid cells covering `window` — blank padding cells (no date) fill out the first and last week, so days outside the window are hidden rather than showing a neighbouring cycle's days. */
function buildGridCells(window: CycleWindow): Cell[] {
  const startEpoch = toEpochDay(window.start);
  const endEpoch = toEpochDay(window.end);
  const leadingBlanks = mondayIndex(startEpoch);

  const cells: Cell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) cells.push({ date: fromEpochDay(epoch) });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

const DAY_STATE_LABEL: Record<DayState, string> = {
  present: "Present",
  paidLeave: "Paid leave",
  unpaidLeave: "Unpaid leave",
  off: "Off",
};

/**
 * Cycle pane — Monday-first calendar grid of a Cycle window (SPEC.md §4).
 * Fetches its own per-day Marks (useWorkerCycle only carries aggregated
 * Settlements, see that file's comment) and classifies each day locally via
 * dayStates.ts, which mirrors computeSettlement's paid/unpaid algorithm —
 * so colouring updates the instant a PUT resolves, without waiting on a
 * fresh settlement round-trip. Tapping a day cycles
 * Present -> Leave -> Off -> Present; each tap is its own PUT. `refresh()`
 * is called after every successful mark so Home cards / the Settle pane
 * (which read aggregated settlements via useWorkerCycle) pick up the change
 * too.
 */
export default function Cycle({
  worker,
  current,
  past,
  refresh,
  loadMorePast,
  hasMorePast,
}: WorkerPaneProps) {
  const windows = useMemo(() => [current, ...past], [current, past]);
  const [windowIndex, setWindowIndex] = useState(0);
  const viewIndex = Math.min(windowIndex, windows.length - 1);
  const viewEntry = windows[viewIndex] ?? current;
  const window = viewEntry.window;

  const [marks, setMarks] = useState<MarkRow[] | null>(null);
  const [marksError, setMarksError] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<ISODate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const today = todayISO();

  // A worker switch (or navigating panes back to a different worker) should
  // land back on the current window, not wherever a previous worker's view was left.
  useEffect(() => {
    setWindowIndex(0);
  }, [worker.id]);

  // Don't strand the index past the end of what's loaded — request the next
  // page as soon as we're viewing the oldest window we have and more exist.
  useEffect(() => {
    if (viewIndex === windows.length - 1 && hasMorePast) {
      loadMorePast();
    }
  }, [viewIndex, windows.length, hasMorePast, loadMorePast]);

  useEffect(() => {
    let cancelled = false;
    setMarks(null);
    setMarksError(null);
    getMarks(worker.id, window.start, window.end).then(({ status, body }) => {
      if (cancelled) return;
      if (status !== 200) {
        setMarksError(body.error ?? "Could not load the calendar.");
        return;
      }
      setMarks(body.marks);
    });
    return () => {
      cancelled = true;
    };
  }, [worker.id, window.start, window.end]);

  const dayStates = useMemo(
    () => (marks ? classifyDays(worker, window, marks, today) : null),
    [marks, worker, window, today],
  );

  const cells = useMemo(() => buildGridCells(window), [window]);

  async function handleTapDay(date: ISODate) {
    if (!dayStates || pendingDate) return;
    const state = dayStates.get(date);
    if (state === undefined) return; // outside the editable range (future / pre-joining / post-archive)

    setActionError(null);
    setPendingDate(date);
    try {
      const target = nextMarkState(state);
      const { status, body } = await putMark(worker.id, date, target);
      if (status !== 200) {
        setActionError(body.error ?? "Could not update that day.");
        return;
      }
      // Update the local Marks list immediately — dayStates recomputes from
      // this on the next render, so colouring (including any quota reflow)
      // is visible without waiting on a fresh GET.
      setMarks((prev) => {
        const withoutDate = (prev ?? []).filter((m) => m.date !== date);
        return target === "present" ? withoutDate : [...withoutDate, { date, state: target }];
      });
      refresh();
    } finally {
      setPendingDate(null);
    }
  }

  const canGoLater = viewIndex > 0;
  const canGoEarlier = viewIndex < windows.length - 1 || hasMorePast;

  return (
    <div className="pane card">
      <div className="cal-nav">
        <button
          className="cal-nav-btn"
          type="button"
          onClick={() =>
            setWindowIndex((i) => Math.min(i + 1, windows.length - 1 + (hasMorePast ? 1 : 0)))
          }
          disabled={!canGoEarlier}
        >
          &larr; Earlier
        </button>
        <span className="cal-nav-label">{formatWindow(window)}</span>
        <button
          className="cal-nav-btn"
          type="button"
          onClick={() => setWindowIndex((i) => Math.max(i - 1, 0))}
          disabled={!canGoLater}
        >
          Later &rarr;
        </button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {marksError && <p className="cal-error">{marksError}</p>}

      {!marksError && !dayStates && <p className="muted">Loading calendar…</p>}

      {dayStates && (
        <div className="cal-grid">
          {cells.map((cell, i) => {
            if (cell.date === null) return <span key={`blank-${i}`} className="cal-cell cal-blank" />;
            const date = cell.date;
            const state = dayStates.get(date);
            const editable = state !== undefined;
            const isToday = date === today;
            const isPending = pendingDate === date;
            const classes = ["cal-cell"];
            if (state) classes.push(`cal-${state}`);
            if (!editable) classes.push("cal-disabled");
            if (isToday) classes.push("cal-today");
            if (isPending) classes.push("cal-pending");
            return (
              <button
                key={date}
                type="button"
                className={classes.join(" ")}
                disabled={!editable || pendingDate !== null}
                aria-label={`${date}${state ? `, ${DAY_STATE_LABEL[state]}` : ""}${isToday ? ", today" : ""}`}
                onClick={() => handleTapDay(date)}
              >
                {Number(date.slice(-2))}
              </button>
            );
          })}
        </div>
      )}

      {actionError && (
        <p className="cal-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-present" /> Present
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-paidLeave" /> Paid leave
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-unpaidLeave" /> Unpaid leave
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-off" /> Off
        </span>
      </div>
    </div>
  );
}
