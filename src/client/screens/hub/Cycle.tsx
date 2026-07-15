import type { WorkerPaneProps } from "./useWorkerCycle";

/**
 * Cycle pane — Monday-first calendar grid of the current window, tap-to-cycle
 * Present → Leave → Off → Present, legend, and stepping back through
 * previous windows (SPEC.md §4). Owned by ticket 05 ("Marking days"); this
 * is a stub so the Worker hub renders correctly before that ticket lands.
 *
 * Ticket 05: build the calendar directly in this file. `WorkerPaneProps`
 * (see ./useWorkerCycle) gives you `worker`, `current` (window + computed
 * Settlement), `past`, and `refresh()`/`loadMorePast()` — but NOT individual
 * day states (Marks), since that hook only carries aggregated settlements.
 * Fetch per-day Marks for the window yourself (a new routes/marks.ts is the
 * natural place, per SPEC.md §7's `PUT /api/marks/:workerId/:date`); call
 * `refresh()` after any mark change so the Home cards / Settle pane / other
 * panes stay in sync. No changes needed elsewhere in the hub to wire this
 * pane in — WorkerHub.tsx already renders it for the "Cycle" segment.
 */
export default function Cycle({ worker, current }: WorkerPaneProps) {
  return (
    <div className="pane card">
      <p className="muted">
        Cycle calendar for {worker.name}, {current.window.start} – {current.window.end}, lands here.
      </p>
    </div>
  );
}
