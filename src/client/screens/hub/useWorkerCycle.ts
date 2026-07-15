import { useCallback, useEffect, useState } from "react";
import { getWorkerCycles, getWorkerDetail } from "../../api";
import type { CycleEntry, WorkerDetail } from "../../api";

// The shared data-fetch seam for the Worker hub (SPEC.md §4). WorkerHub.tsx
// calls this once and passes the result down as `WorkerPaneProps` to
// Cycle.tsx (ticket 05), Settle.tsx (ticket 06), and Details.tsx (this
// ticket) — none of those three files should fetch worker/window/settlement
// data on their own; they read it from these props and call `refresh()`
// after any mutation of their own (a mark, a payment, …).
//
// This does NOT carry per-day Marks — only aggregated Settlements per
// window. Ticket 05's calendar needs individual day states to colour cells;
// it should add its own small marks-fetching (see routes/marks.ts) rather
// than have this hook grow a `marks` field, keeping this file's contract
// stable for both consumers.

export interface UseWorkerCycleResult {
  worker: WorkerDetail | null;
  current: CycleEntry | null;
  past: CycleEntry[];
  loading: boolean;
  error: string | null;
  /** Re-fetches worker detail + the current window's settlement + the first page of past windows. Call after any mutation (mark, payment, rate/quota/cycle change, archive). */
  refresh: () => void;
  /** Appends the next page of past windows (uses the cursor from the last fetch). No-op if there is nothing more. */
  loadMorePast: () => void;
  hasMorePast: boolean;
}

/** Props every hub pane (Cycle / Settle / Details) receives — worker and window data always present (WorkerHub only renders panes once loaded). */
export interface WorkerPaneProps {
  worker: WorkerDetail;
  current: CycleEntry;
  past: CycleEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  loadMorePast: () => void;
  hasMorePast: boolean;
}

export function useWorkerCycle(workerId: number): UseWorkerCycleResult {
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [current, setCurrent] = useState<CycleEntry | null>(null);
  const [past, setPast] = useState<CycleEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const [detailRes, cyclesRes] = await Promise.all([
        getWorkerDetail(workerId),
        getWorkerCycles(workerId),
      ]);
      if (cancelled) return;

      if (detailRes.status !== 200 || cyclesRes.status !== 200) {
        setError(detailRes.body.error ?? cyclesRes.body.error ?? "Could not load worker.");
        setLoading(false);
        return;
      }

      setWorker(detailRes.body);
      setCurrent(cyclesRes.body.current);
      setPast(cyclesRes.body.past);
      setNextBefore(cyclesRes.body.nextBefore);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const loadMorePast = useCallback(() => {
    if (!nextBefore) return;
    (async () => {
      const res = await getWorkerCycles(workerId, nextBefore);
      if (res.status === 200) {
        setPast((prev) => [...prev, ...res.body.past]);
        setNextBefore(res.body.nextBefore);
      }
    })();
  }, [workerId, nextBefore]);

  return {
    worker,
    current,
    past,
    loading,
    error,
    refresh,
    loadMorePast,
    hasMorePast: nextBefore !== null,
  };
}
