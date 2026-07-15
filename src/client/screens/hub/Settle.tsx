import type { WorkerPaneProps } from "./useWorkerCycle";
import { formatRupees } from "../../lib/format";

/**
 * Settle pane — current window's settlement breakdown (Present / Paid leave
 * n of quota / Unpaid leave / Off half-pay, rate-split note, exact + rounded
 * total), then past cycles with a Payment chip or "Mark paid" button and a
 * Drift banner (SPEC.md §1.9, §3, §4). Owned by ticket 06 ("Settle pane");
 * this is a stub so the Worker hub renders correctly before that ticket
 * lands.
 *
 * Ticket 06: build the breakdown directly in this file. `WorkerPaneProps`
 * (see ./useWorkerCycle) already gives you `current.settlement` (counts,
 * amounts, segments, exact, total — the exact shape computeSettlement
 * returns, see src/shared/settlement.ts) and `past` (same shape per past
 * window) with `loadMorePast()`/`hasMorePast` for history paging. Payments
 * aren't in this hook yet — add a routes/payments.ts
 * (`POST /api/payments`, SPEC.md §7) and fetch/mutate them from here; call
 * `refresh()` after "Mark paid" so Home/Details/Cycle stay in sync. No
 * changes needed elsewhere in the hub to wire this pane in — WorkerHub.tsx
 * already renders it for the "Settle" segment.
 */
export default function Settle({ worker, current }: WorkerPaneProps) {
  return (
    <div className="pane card">
      <p className="muted">
        Settlement breakdown for {worker.name}'s current window lands here — so far:{" "}
        <span className="money">{formatRupees(current.settlement.total)}</span>.
      </p>
    </div>
  );
}
