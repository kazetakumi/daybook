import { useState } from "react";
import { useWorkerCycle } from "./useWorkerCycle";
import type { WorkerPaneProps } from "./useWorkerCycle";
import Cycle from "./Cycle";
import Settle from "./Settle";
import Details from "./Details";
import { formatWindow } from "../../lib/format";

type Pane = "cycle" | "settle" | "details";

const AVATAR_PALETTE = ["#C75B12", "#4C63C7", "#1F8A4C", "#7A5000", "#8C4C9E", "#0E7C86"];

function avatarColor(id: number): string {
  return AVATAR_PALETTE[((id % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length]!;
}

/**
 * Worker hub shell (SPEC.md §4): header (name, current window) + segmented
 * control Cycle | Settle | Details. Fetches once via useWorkerCycle and
 * hands the same `WorkerPaneProps` to whichever pane is active — Cycle.tsx
 * (ticket 05) and Settle.tsx (ticket 06) are separate files each of those
 * tickets owns outright; this file (and Details.tsx) is ticket 04's.
 */
export default function WorkerHub({ workerId, onBack }: { workerId: number; onBack: () => void }) {
  const data = useWorkerCycle(workerId);
  const [pane, setPane] = useState<Pane>("cycle");
  const hasData = data.worker !== null && data.current !== null;

  // "Loading…" replaces the hub only on the very first fetch. A refresh()
  // after a mutation keeps the hub mounted on the previous data until the new
  // data lands — unmounting it would throw away pane state such as which
  // Cycle window the calendar is showing.
  return (
    <div className="screen">
      <button className="btn-secondary" type="button" onClick={onBack}>
        &larr; Workers
      </button>

      {data.loading && !hasData && <p className="muted">Loading…</p>}

      {!data.loading && (data.error || !hasData) && (
        <p className="muted" role="alert">
          {data.error ?? "Could not load this worker."}
        </p>
      )}

      {data.worker && data.current && (
        <HubBody
          worker={data.worker}
          current={data.current}
          past={data.past}
          loading={data.loading}
          error={data.error}
          refresh={data.refresh}
          loadMorePast={data.loadMorePast}
          hasMorePast={data.hasMorePast}
          pane={pane}
          setPane={setPane}
          onBack={onBack}
        />
      )}
    </div>
  );
}

function HubBody({
  pane,
  setPane,
  onBack,
  ...paneProps
}: WorkerPaneProps & { pane: Pane; setPane: (p: Pane) => void; onBack: () => void }) {
  const { worker, current } = paneProps;
  const initial = worker.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <div className="hub-header">
        <span className="avatar" style={{ background: avatarColor(worker.id) }}>
          {initial}
        </span>
        <span>
          <h2>{worker.name}</h2>
          <span className="sub">{formatWindow(current.window)}</span>
        </span>
      </div>

      <div className="segmented" role="tablist" aria-label="Worker view">
        <button type="button" role="tab" aria-selected={pane === "cycle"} onClick={() => setPane("cycle")}>
          Cycle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "settle"}
          onClick={() => setPane("settle")}
        >
          Settle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "details"}
          onClick={() => setPane("details")}
        >
          Details
        </button>
      </div>

      {pane === "cycle" && <Cycle {...paneProps} />}
      {pane === "settle" && <Settle {...paneProps} />}
      {pane === "details" && <Details {...paneProps} onArchived={onBack} />}
    </>
  );
}
