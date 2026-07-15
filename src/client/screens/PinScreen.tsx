import { useState } from "react";
import type { FormEvent } from "react";
import { login, setPin } from "../api";

type Props = {
  /** "setup" on a fresh database (no PIN yet); "login" otherwise. */
  mode: "setup" | "login";
  onSuccess: () => void;
};

/**
 * The family-PIN gate (SPEC.md §5). Shown on first load until an
 * authenticated session exists, and again from anywhere in the app the
 * moment any API call 401s (wired in App.tsx via api.ts's
 * setUnauthorizedHandler).
 */
export default function PinScreen({ mode, onSuccess }: Props) {
  const [pin, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "setup") {
      if (!/^\d{4,6}$/.test(pin)) {
        setError("PIN must be 4-6 digits.");
        return;
      }
      if (pin !== confirmPin) {
        setError("PINs don't match.");
        setConfirmPin("");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { status, body } = mode === "setup" ? await setPin(pin) : await login(pin);
      if (status === 200) {
        onSuccess();
        return;
      }
      setError(body.error ?? "Something went wrong.");
      setPinValue("");
      setConfirmPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <p className="eyebrow">Daybook</p>
        <h2>{mode === "setup" ? "Set a household PIN" : "Enter PIN"}</h2>
        {mode === "setup" && (
          <p className="muted">
            One shared PIN for the household. You'll enter it twice to confirm.
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            autoComplete="off"
            autoFocus
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="PIN"
          />

          {mode === "setup" && (
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              autoComplete="off"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label="Confirm PIN"
            />
          )}

          {error && (
            <p className="muted" role="alert" style={{ color: "var(--leave)" }}>
              {error}
            </p>
          )}

          <button className="btn-primary" type="submit" disabled={submitting || pin.length < 4}>
            {submitting ? "Please wait…" : mode === "setup" ? "Set PIN" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
