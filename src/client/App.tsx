import { useEffect, useState } from "react";
import { SHARED_OK } from "../shared";

// Proves src/shared resolves cleanly from the client side (Vite/DOM). See
// src/server/db.ts for the server-side (Node/tsx) half of this check.
void SHARED_OK;

// Minimal state-based screen switch. No router library — later tickets
// (03 PIN screen, 04 home/hub) extend this `Screen` union and the switch
// below instead of introducing their own navigation mechanism.
type Screen = { name: "home" } | { name: "worker"; workerId: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Daybook</h1>
      </header>
      <main>
        {screen.name === "home" && (
          <HomeScreen onOpenWorker={(workerId) => setScreen({ name: "worker", workerId })} />
        )}
        {screen.name === "worker" && (
          <WorkerScreen workerId={screen.workerId} onBack={() => setScreen({ name: "home" })} />
        )}
      </main>
    </div>
  );
}

function HomeScreen({ onOpenWorker }: { onOpenWorker: (workerId: number) => void }) {
  const health = useHealthCheck();

  return (
    <div className="screen">
      <p className="muted">
        Home — one card per active Worker lands here (ticket 04). This scaffold just proves the
        client, server, and database are wired together.
      </p>
      <p className="muted">
        API health: <strong>{health}</strong>
      </p>
      <button className="btn-primary" type="button" onClick={() => onOpenWorker(1)}>
        Open a worker (placeholder)
      </button>
    </div>
  );
}

function WorkerScreen({ workerId, onBack }: { workerId: number; onBack: () => void }) {
  return (
    <div className="screen">
      <button className="btn-secondary" type="button" onClick={onBack}>
        &larr; Back
      </button>
      <p className="muted">
        Worker hub for worker #{workerId} — Cycle / Settle / Details segmented control lands here
        (tickets 05–06).
      </p>
    </div>
  );
}

function useHealthCheck(): string {
  const [status, setStatus] = useState("checking…");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => res.json())
      .then((body: { ok: boolean }) => {
        if (!cancelled) setStatus(body.ok ? "ok" : "unexpected response");
      })
      .catch(() => {
        if (!cancelled) setStatus("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
