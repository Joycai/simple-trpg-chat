/**
 * Human-readable byte formatting for the admin UI. Client-safe (no fs imports).
 */

/** Format a byte count as e.g. `2.4 GB`, `640 MB`, `82 KB`, `0 B`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  // Whole numbers below GB read cleaner without a decimal (e.g. `640 MB`).
  const digits = i >= 3 ? 1 : value >= 100 || Number.isInteger(value) ? 0 : value >= 10 ? 1 : 1;
  return `${value.toFixed(digits)} ${units[i]}`;
}

/** Split a byte count into its numeric part and unit, e.g. `{ value: "2.4", unit: "GB" }`. */
export function splitBytes(bytes: number): { value: string; unit: string } {
  const formatted = formatBytes(bytes);
  const idx = formatted.lastIndexOf(" ");
  return { value: formatted.slice(0, idx), unit: formatted.slice(idx + 1) };
}
