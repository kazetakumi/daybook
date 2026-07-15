import { useEffect, useState } from "react";
import { SHARED_OK } from "../shared";
import { getAuthSession, getAuthStatus, setUnauthorizedHandler } from "./api";
import HomeScreen from "./screens/HomeScreen";
import PinScreen from "./screens/PinScreen";
import SettingsScreen from "./screens/SettingsScreen";
import WorkerHub from "./screens/hub/WorkerHub";

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
          <WorkerHub workerId={screen.workerId} onBack={() => setScreen({ name: "home" })} />
        )}
        {authReady && screen.name === "settings" && (
          <SettingsScreen onBack={() => setScreen({ name: "home" })} />
        )}
      </main>
    </div>
  );
}
