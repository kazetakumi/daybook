import { useEffect, useState } from "react";
import { SHARED_OK } from "../shared";
import { getAuthSession, getAuthStatus, setUnauthorizedHandler } from "./api";
import PinScreen from "./screens/PinScreen";
import SettingsScreen from "./screens/SettingsScreen";

// Proves src/shared resolves cleanly from the client side (Vite/DOM). See
// src/server/db.ts for the server-side (Node/tsx) half of this check.
void SHARED_OK;

// Minimal state-based screen switch. No router library — later tickets
// (04 home/hub) extend this `Screen` union and the switch below instead of
// introducing their own navigation mechanism. "pin" and "settings" were
// added by ticket 03 (PIN auth).
type Screen =
  | { name: "home" }
  | { name: "worker"; workerId: number }
  | { name: "pin" }
  | { name: "settings" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  // Whether the PIN screen should offer first-run set-PIN or ordinary
  // login; irrelevant except while screen.name === "pin".
  const [pinMode, setPinMode] = useState<"setup" | "login">("login");
  // Gates the initial render so we don't flash "home" before we know
  // whether a session actually exists.
  const [authReady, setAuthReady] = useState(false);

  // Any API call 401ing (session missing/expired) drops the app back to
  // the PIN screen from wherever it is — see src/client/api.ts.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setPinMode("login");
      setScreen({ name: "pin" });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // On load: no PIN ever set → set-PIN flow. PIN set but no valid session
  // → login. PIN set and valid session → straight to home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { body: authStatus } = await getAuthStatus();
      if (cancelled) return;

      if (!authStatus.pinSet) {
        setPinMode("setup");
        setScreen({ name: "pin" });
        setAuthReady(true);
        return;
      }

      const { status } = await getAuthSession();
      if (cancelled) return;

      if (status === 200) {
        setScreen({ name: "home" });
      } else {
        setPinMode("login");
        setScreen({ name: "pin" });
      }
      setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Daybook</h1>
      </header>
      <main>
        {!authReady && <div className="screen" />}
        {authReady && screen.name === "pin" && (
          <PinScreen mode={pinMode} onSuccess={() => setScreen({ name: "home" })} />
        )}
        {authReady && screen.name === "home" && (
          <HomeScreen
            onOpenWorker={(workerId) => setScreen({ name: "worker", workerId })}
            onOpenSettings={() => setScreen({ name: "settings" })}
          />
        )}
        {authReady && screen.name === "worker" && (
          <WorkerScreen workerId={screen.workerId} onBack={() => setScreen({ name: "home" })} />
        )}
        {authReady && screen.name === "settings" && (
          <SettingsScreen onBack={() => setScreen({ name: "home" })} />
        )}
      </main>
    </div>
  );
}

function HomeScreen({
  onOpenWorker,
  onOpenSettings,
}: {
  onOpenWorker: (workerId: number) => void;
  onOpenSettings: () => void;
}) {
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
      {/* Temporary entry point so Settings (ticket 03) is reachable before
          ticket 04 builds the real home screen. Ticket 04 should replace
          this with the spec'd "small gear on home" and route it to the
          same { name: "settings" } screen — see screens/SettingsScreen.tsx. */}
      <button className="btn-secondary" type="button" onClick={onOpenSettings}>
        Settings
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
