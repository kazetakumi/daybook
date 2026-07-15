// Thin fetch wrapper shared by every client API call. Its job: attach
// credentials, and detect a 401 (missing/expired/invalid session) so the
// app can drop back to the PIN screen from anywhere, per SPEC.md §5
// ("Client shows the PIN screen on any 401"). Later tickets (04-08) should
// call `apiFetch` (or the small helpers below) instead of raw `fetch` for
// anything under /api/*, so their routes get the same 401 handling for free.

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered once by App.tsx on mount; called whenever any API call 401s. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

// Auth endpoints that legitimately return 401 as part of normal operation
// (e.g. a wrong PIN on /api/login) must not trigger the global "session
// expired, show PIN screen" redirect — the caller handles their error
// inline instead.
const SUPPRESS_UNAUTHORIZED_REDIRECT = new Set(["/api/login"]);

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (res.status === 401 && !SUPPRESS_UNAUTHORIZED_REDIRECT.has(path) && onUnauthorized) {
    onUnauthorized();
  }

  return res;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await apiFetch(path, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

export type AuthStatus = { pinSet: boolean };

/** GET /api/auth/status — whether a PIN has ever been set on this install. */
export function getAuthStatus(): Promise<{ status: number; body: AuthStatus }> {
  return apiJson<AuthStatus>("/api/auth/status");
}

/** GET /api/auth/session — 200 iff the current cookie is a valid session. */
export function getAuthSession(): Promise<{ status: number; body: { ok?: boolean } }> {
  return apiJson("/api/auth/session");
}

type OkOrError = { ok?: boolean; error?: string };

/** POST /api/auth/set-pin {pin} — first-run only; 409 if a PIN already exists. */
export function setPin(pin: string): Promise<{ status: number; body: OkOrError }> {
  return apiJson<OkOrError>("/api/auth/set-pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

/** POST /api/login {pin} */
export function login(pin: string): Promise<{ status: number; body: OkOrError }> {
  return apiJson<OkOrError>("/api/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

/** POST /api/auth/change-pin {currentPin, newPin} */
export function changePin(
  currentPin: string,
  newPin: string,
): Promise<{ status: number; body: OkOrError }> {
  return apiJson<OkOrError>("/api/auth/change-pin", {
    method: "POST",
    body: JSON.stringify({ currentPin, newPin }),
  });
}
