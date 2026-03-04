/**
 * SSR-safe localStorage flag helpers.
 * All functions are safe to call in SSR / Edge / test environments:
 *   - Return null / 0 when window is undefined.
 *   - Wrap every access in try/catch to survive storage quota errors,
 *     SecurityError in sandboxed iframes, and private-browsing restrictions.
 *
 * No free text stored. Keys and values are enum strings, ISO timestamps,
 * or small integers. No sensitive data passes through these helpers.
 */

// ---------------------------------------------------------------------------
// readFlag
// ---------------------------------------------------------------------------

/**
 * Read a string flag from localStorage.
 * Returns null in SSR or on any storage error.
 */
export function readFlag(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// writeFlag
// ---------------------------------------------------------------------------

/**
 * Write a string flag to localStorage.
 * No-op in SSR or on any storage error.
 */
export function writeFlag(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, SecurityError, or private-browsing restriction — best-effort only.
  }
}

// ---------------------------------------------------------------------------
// readISODate
// ---------------------------------------------------------------------------

/**
 * Read a stored ISO 8601 timestamp from localStorage and parse it to a Date.
 * Returns null if the key is absent, the value is not a valid date, or in SSR.
 */
export function readISODate(key: string): Date | null {
  const raw = readFlag(key);
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ---------------------------------------------------------------------------
// readInt
// ---------------------------------------------------------------------------

/**
 * Read a stored integer from localStorage.
 * Returns 0 if the key is absent, the value is not a finite integer, or in SSR.
 */
export function readInt(key: string): number {
  const raw = readFlag(key);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
