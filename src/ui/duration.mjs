/** Human-friendly elapsed time for a compact terminal status line.
 * Two significant units keep the label readable at 36 columns while
 * advancing from seconds to minutes, hours and days without overflow.
 *
 * 59s -> 59s; 1m 01s -> 1m 01s; 1h 02m -> 1h 02m; 3d 04h -> 3d 04h.
 * Time is elapsed monotonic-like duration, not a calendar date/time.
 */
export function formatDuration(milliseconds) {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${String(hours % 24).padStart(2, '0')}h`;
}
