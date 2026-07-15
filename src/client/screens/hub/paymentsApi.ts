// Thin client for src/server/routes/payments.ts, kept local to the Worker
// hub (rather than added to ../../api.ts) so ticket 06 doesn't touch a file
// ticket 05 is concurrently editing for its own marks helpers. Reuses
// apiFetch from ../../api for the shared 401-detection behaviour.

import { apiFetch } from "../../api";

export type Payment = {
  periodStart: string;
  periodEnd: string;
  amount: number;
  paidOn: string;
};

type OkOrError = { ok?: boolean; error?: string };

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await apiFetch(path, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

/** GET /api/payments/:workerId — every Payment snapshot recorded for this Worker. */
export function getPayments(
  workerId: number,
): Promise<{ status: number; body: { payments: Payment[] } & OkOrError }> {
  return apiJson<{ payments: Payment[] } & OkOrError>(`/api/payments/${workerId}`);
}

/**
 * POST /api/payments {workerId, periodStart, periodEnd} — "Mark paid". The
 * server recomputes the live Settlement itself and snapshots that amount +
 * today's date; the client never sends an amount (SPEC.md §1.9, ADR-0001).
 */
export function markPaid(
  workerId: number,
  periodStart: string,
  periodEnd: string,
): Promise<{ status: number; body: Payment & OkOrError }> {
  return apiJson<Payment & OkOrError>("/api/payments", {
    method: "POST",
    body: JSON.stringify({ workerId, periodStart, periodEnd }),
  });
}
