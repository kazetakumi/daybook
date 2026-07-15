// Shared display formatting — rupee amounts (en-IN grouping, SPEC.md
// §1.11) and dates. Used by Home cards, the Worker hub panes (Cycle —
// ticket 05, Settle — ticket 06, Details — this ticket), and later Share
// text (ticket 07). Keep additions here generic (formatting only, no
// fetching/state) rather than screen-specific.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dateParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

/** `250` -> "₹250"; `5312.5` -> "₹5,312.5" (en-IN grouping, up to 2 decimals). */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** "2026-06-20" -> "Jun 20" */
export function formatDate(iso: string): string {
  const { m, d } = dateParts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "2026-06-20" -> "Jun 20, 2026" */
export function formatDateYear(iso: string): string {
  const { y, m, d } = dateParts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** {start:"2026-06-01", end:"2026-06-30"} -> "Jun 1 – Jun 30" */
export function formatWindow(window: { start: string; end: string }): string {
  return `${formatDate(window.start)} – ${formatDate(window.end)}`;
}
