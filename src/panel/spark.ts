// The day's shape, drawn in text.
//
// Shared by the status bar hover and the status menu so the two never disagree
// about what today looked like.

/** Eight levels of block, one cell per hour elapsed. */
const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * The real hourly series, scaled to its own busiest hour.
 *
 * Scaled to the day rather than to the cap on purpose: a runaway is visible as
 * a spike while it is still running, long before the percentage has climbed
 * anywhere alarming.
 */
export function sparkline(series: number[]): string {
  const window = elapsed(series);
  const max = Math.max(0, ...window);
  if (max <= 0) return '';
  return window
    .map(v => SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.round((v / max) * (SPARK.length - 1))))])
    .join('');
}

/** The hour that took the most, or -1 if nothing has been spent. */
export function peakHour(series: number[]): number {
  const window = elapsed(series);
  let hour = -1, max = 0;
  for (let h = 0; h < window.length; h++) {
    if ((window[h] ?? 0) > max) { max = window[h]; hour = h; }
  }
  return hour;
}

/** "14:00" for hour 14. */
export function clockHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Only as far as the day has got — trailing zeros would read as a long quiet
 * spell rather than as hours that have not happened.
 */
function elapsed(series: number[]): number[] {
  if (!Array.isArray(series) || series.length === 0) return [];
  return series.slice(0, Math.min(series.length - 1, new Date().getHours()) + 1);
}

/** Time left in the day, which is more use than the wall-clock midnight. */
export function resetsIn(): string {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - Date.now()) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `in ${h}h ${mins % 60}m` : `in ${mins}m`;
}

export function fmtCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
