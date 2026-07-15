// Thin fetch wrapper shared by every client API call. Its job: attach
// credentials, and detect a 401 (missing/expired/invalid session) so the
// app can drop back to the PIN screen from anywhere, per SPEC.md §5
// ("Client shows the PIN screen on any 401"). Later tickets (04-08) should
// call `apiFetch` (or the small helpers below) instead of raw `fetch` for
// anything under /api/*, so their routes get the same 401 handling for free.

import type { CycleConfig, CycleWindow, RatePeriod, Settlement } from "../shared/settlement";

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

// ---------------------------------------------------------------------------
// Workers / Home / Worker hub (ticket 04) — src/server/routes/workers.ts.
// Every helper below resolves { status, body }; treat any status !== 200 as
// failure and read `body.error` for the message, same convention as auth.
// ---------------------------------------------------------------------------

export type HomeCard = {
  id: number;
  name: string;
  role: string | null;
  avatarInitial: string;
  paidLeavesPerCycle: number;
  leavesUsed: number;
  amount: number;
  window: CycleWindow;
  progress: number; // 0..1, fraction of the current window elapsed
};

/** GET /api/home — one card per active Worker, current-cycle running total. */
export function getHome(): Promise<{
  status: number;
  body: { workers: HomeCard[] } & OkOrError;
}> {
  return apiJson<{ workers: HomeCard[] } & OkOrError>("/api/home");
}

export type CreateWorkerInput = {
  name: string;
  role?: string;
  rate: number;
  cycleStartDay: number;
  quota?: number;
};

/** POST /api/workers {name, role?, rate, cycleStartDay, quota?} — joined_on defaults to today. */
export function createWorker(
  input: CreateWorkerInput,
): Promise<{ status: number; body: { id: number } & OkOrError }> {
  return apiJson<{ id: number } & OkOrError>("/api/workers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type WorkerDetail = {
  id: number;
  name: string;
  role: string | null;
  joinedOn: string;
  archivedOn: string | null;
  paidLeavesPerCycle: number;
  currentRate: number;
  currentCycleStartDay: number;
  ratePeriods: RatePeriod[];
  cycleConfigs: CycleConfig[];
};

/** GET /api/workers/:id — full detail for the Worker hub's Details pane. */
export function getWorkerDetail(id: number): Promise<{ status: number; body: WorkerDetail & OkOrError }> {
  return apiJson<WorkerDetail & OkOrError>(`/api/workers/${id}`);
}

/** PATCH /api/workers/:id {quota?, archive?} — archive is one-way; both fields optional and independent. */
export function updateWorker(
  id: number,
  patch: { quota?: number; archive?: boolean },
): Promise<{
  status: number;
  body: { id: number; archivedOn: string | null; paidLeavesPerCycle: number } & OkOrError;
}> {
  return apiJson<{ id: number; archivedOn: string | null; paidLeavesPerCycle: number } & OkOrError>(
    `/api/workers/${id}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

/** POST /api/workers/:id/rate {rate, effectiveFrom} — appends a new rate_periods row. */
export function changeRate(
  id: number,
  rate: number,
  effectiveFrom: string,
): Promise<{ status: number; body: { effectiveFrom: string } & OkOrError }> {
  return apiJson<{ effectiveFrom: string } & OkOrError>(`/api/workers/${id}/rate`, {
    method: "POST",
    body: JSON.stringify({ rate, effectiveFrom }),
  });
}

/**
 * POST /api/workers/:id/cycle-config {startDay} — appends a new
 * cycle_configs row. Per SPEC.md §1.8 the server computes effectiveFrom as
 * the day after the current window ends (not today) and returns it, so the
 * caller can confirm "takes effect from <date>" without recomputing it.
 */
export function changeCycleConfig(
  id: number,
  startDay: number,
): Promise<{ status: number; body: { effectiveFrom: string } & OkOrError }> {
  return apiJson<{ effectiveFrom: string } & OkOrError>(`/api/workers/${id}/cycle-config`, {
    method: "POST",
    body: JSON.stringify({ startDay }),
  });
}

export type CycleEntry = { window: CycleWindow; settlement: Settlement };

/** GET /api/workers/:id/cycles?before= — current window + a page of past windows, each with a computed Settlement. */
export function getWorkerCycles(
  id: number,
  before?: string,
): Promise<{
  status: number;
  body: { current: CycleEntry; past: CycleEntry[]; nextBefore: string | null } & OkOrError;
}> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return apiJson<{ current: CycleEntry; past: CycleEntry[]; nextBefore: string | null } & OkOrError>(
    `/api/workers/${id}/cycles${query}`,
  );
}

// ---------------------------------------------------------------------------
// Backup (ticket 08) — src/server/routes/backup.ts.
// ---------------------------------------------------------------------------

/**
 * GET /api/backup — fetches the snapshot as a blob (rather than a plain
 * `<a href>` navigation) so a 401 can be handled the same way every other
 * route already is (apiFetch's global "session expired" redirect, see
 * above) instead of the browser silently rendering an error page in place
 * of a download. On success, triggers a normal browser file download via a
 * throwaway object URL and reads the dated filename off the
 * Content-Disposition header the server sent (see backup.ts) rather than
 * hardcoding it here.
 */
export async function downloadBackup(): Promise<OkOrError> {
  const res = await apiFetch("/api/backup");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as OkOrError;
    return { error: body.error ?? `Download failed (${res.status})` };
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? "daybook-backup.sqlite";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { ok: true };
}
