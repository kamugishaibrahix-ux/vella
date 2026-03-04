/**
 * DB PAYLOAD CONTRACT
 * ===================
 * Enforces snake_case keys on all payloads destined for Supabase writes.
 * Prevents camelCase keys from accidentally triggering the PII firewall's
 * forbidden-field pattern matchers (e.g. /message/i matching "messageLength").
 *
 * @module lib/safe/dbPayload
 */

/** Regex that detects camelCase boundaries: a lowercase letter followed by an uppercase letter. */
const CAMEL_CASE_RE = /[a-z][A-Z]/;

/**
 * Converts a single camelCase or PascalCase key to snake_case.
 * Already-snake_case keys pass through unchanged.
 *
 * Examples:
 *   messageLength  → message_length
 *   userId         → user_id
 *   mode_enum      → mode_enum  (unchanged)
 *   HTMLParser     → html_parser
 */
export function toSnakeCaseKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Shallow-converts all keys of an object from camelCase to snake_case.
 * Values are NOT transformed — only top-level keys.
 */
export function toSnakeCaseObject<T extends Record<string, any>>(
  obj: T,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCaseKey(key)] = value;
  }
  return result;
}

/**
 * Throws in development if any key contains a camelCase boundary.
 * In production this is a no-op — the PII firewall is the last line of defence.
 *
 * @param obj     - The payload to check
 * @param context - A human-readable label (e.g. table name) for error messages
 */
export function assertSnakeCaseKeys(
  obj: Record<string, any>,
  context: string,
): void {
  if (process.env.NODE_ENV !== "development") return;

  for (const key of Object.keys(obj)) {
    if (CAMEL_CASE_RE.test(key)) {
      throw new Error(
        `[DB-PAYLOAD] camelCase key "${key}" detected in payload for "${context}". ` +
        `All DB payload keys must be snake_case. Use toSnakeCaseKey() or fix the source.`,
      );
    }
  }
}

/**
 * Utility type: marks a record as having been validated for snake_case keys.
 * Purely informational — no runtime effect.
 */
export type DbPayload<T extends Record<string, any>> = T & {
  readonly __dbPayloadBrand?: never;
};
