import { useState } from "react";
import type { FormEvent } from "react";
import { changePin, downloadBackup } from "../api";
import packageJson from "../../../package.json";

type Props = {
  onBack: () => void;
};

/**
 * Settings/about screen (SPEC.md §5, §8: "small gear on home"). Ticket 04
 * hasn't built the home screen's gear icon yet, so this component exists
 * and is exported/wired into App.tsx's screen switch, but nothing on the
 * home screen currently navigates to it except the temporary "Settings"
 * link in App.tsx's placeholder HomeScreen (clearly marked there) — ticket
 * 04's agent should replace that with the real gear icon and route it to
 * this same `{ name: "settings" }` screen.
 */
export default function SettingsScreen({ onBack }: Props) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupInFlight, setBackupInFlight] = useState(false);

  async function handleDownloadBackup() {
    setBackupError(null);
    setBackupInFlight(true);
    try {
      const result = await downloadBackup();
      if (result.error) setBackupError(result.error);
    } finally {
      setBackupInFlight(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!/^\d{4,6}$/.test(newPin)) {
      setError("New PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setError("New PINs don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const { status, body } = await changePin(currentPin, newPin);
      if (status === 200) {
        setSuccess(true);
        setCurrentPin("");
        setNewPin("");
        setConfirmNewPin("");
        return;
      }
      setError(body.error ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <button className="btn-secondary" type="button" onClick={onBack}>
        &larr; Back
      </button>

      <div className="card">
        <h2>Settings</h2>
        <p className="eyebrow">Change PIN</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Current PIN"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="Current PIN"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="New PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="New PIN"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Confirm new PIN"
            value={confirmNewPin}
            onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="Confirm new PIN"
          />

          {error && (
            <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
              {error}
            </p>
          )}
          {success && <p className="muted">PIN changed.</p>}

          <button
            className="btn-primary"
            type="submit"
            disabled={submitting || currentPin.length < 4 || newPin.length < 4}
          >
            {submitting ? "Please wait…" : "Change PIN"}
          </button>
        </form>
      </div>

      <div className="card">
        <p className="eyebrow">Backup</p>
        <p className="muted">Download a snapshot of the household database (SPEC.md §8).</p>

        <button
          className="btn-secondary"
          type="button"
          onClick={handleDownloadBackup}
          disabled={backupInFlight}
        >
          {backupInFlight ? "Preparing…" : "Download backup"}
        </button>

        {backupError && (
          <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
            {backupError}
          </p>
        )}
      </div>

      <p className="muted" style={{ textAlign: "center" }}>
        Daybook v{packageJson.version}
      </p>
    </div>
  );
}
