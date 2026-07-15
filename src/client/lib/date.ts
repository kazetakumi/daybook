// Tiny client-side date-string helpers. All dates are ISO `YYYY-MM-DD`,
// lexicographic-comparable, matching src/shared/settlement.ts's ISODate.
// This intentionally does NOT import from settlement.ts (that module's date
// arithmetic is private) — kept separate and minimal for the couple of
// things the UI needs: today's date for defaulting form fields, and a day
// offset for previewing a cycle-config change's effective date.

/** Today's date in the browser's local timezone, ISO `YYYY-MM-DD`. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `n` calendar days after `iso` (negative `n` goes backward). */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
