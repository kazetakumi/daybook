// Thin client for src/server/routes/marks.ts, kept local to the Worker hub
// (rather than added to ../../api.ts) so this ticket doesn't touch a file
// the parallel Settle-pane ticket is concurrently editing for its own
// payments helpers (see paymentsApi.ts, which does the same thing). Reuses
// apiFetch from ../../api for the shared 401-detection behaviour.

import { apiFetch } from "../../api";

/** The wire state accepted by PUT — 'present' additionally means "delete the Mark". */
export type DayMarkState = "present" | "leave" | "off";

export type MarkRow = { date: string; state: "leave" | "off" };

type OkOrError = { ok?: boolean; error?: string };

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await apiFetch(path, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

/** GET /api/marks/:workerId?from=&to= — Marks (Leave/Off rows only) within an inclusive date range. */
export function getMarks(
  workerId: number,
  from: string,
  to: string,
): Promise<{ status: number; body: { marks: MarkRow[] } & OkOrError }> {
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return apiJson<{ marks: MarkRow[] } & OkOrError>(`/api/marks/${workerId}${query}`);
}

/**
 * PUT /api/marks/:workerId/:date {state} — upserts a Leave/Off row, or
 * deletes it when state is 'present' (exceptions-only storage, SPEC.md
 * §1.4). The server rejects a date after today or before the Worker joined.
 */
export function putMark(
  workerId: number,
  date: string,
  state: DayMarkState,
): Promise<{ status: number; body: { ok?: boolean; date?: string; state?: DayMarkState } & OkOrError }> {
  return apiJson(`/api/marks/${workerId}/${date}`, {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
}
