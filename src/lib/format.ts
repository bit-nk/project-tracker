/** Formatting helpers used across pages. Pure, no side effects. */

/** "$12,500" - whole-dollar currency, no cents. Returns "-" for undefined. */
export function formatCurrency(value?: number): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** "$1.2k" / "$12.5k" / "$1.2M" - compact currency for stat tiles. */
export function formatCurrencyCompact(value?: number): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** "Mar 14, 2026" */
export function formatDate(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "Mar 14, 2026, 9:00 AM" */
export function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3 days ago", "in 2 hours", "just now" - relative to now. */
export function formatRelative(iso?: string): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  const diffMs = then - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return "just now";
}

/** Percentage from a ratio, rounded. `formatPercent(0.6667)` -> "67%". */
export function formatPercent(ratio: number): string {
  if (!isFinite(ratio)) return "-";
  return `${Math.round(ratio * 100)}%`;
}
