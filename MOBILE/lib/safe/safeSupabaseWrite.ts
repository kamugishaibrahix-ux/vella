/**
 * SAFE DATA WRITERS
 * - Guards against persisting free-text fields to Supabase.
 * - Callers must provide the appropriate Supabase client (browser or admin).
 * - When WRITE_LOCK_MODE=true, writes throw unless bypassWriteLock is true (e.g. stripe webhook).
 * - Phase Seal: Integrated with PII Firewall for comprehensive personal text blocking.
 *
 * Phase 0: Option 2 — WRITE_BLOCKED_TABLES. Content tables remain in SAFE_TABLES so reads
 * (fromSafe().select()) still work. Writes to journal_entries, conversation_messages, check_ins,
 * memory_chunks, user_reports are blocked here with WRITE_BLOCKED_TABLE so no new text can be
 * written. Removing those tables from SAFE_TABLES would break existing read paths (e.g. state
 * recompute, memory search) before Dexie migration; Option 2 minimises breakage while guaranteeing
 * no new server text writes.
 *
 * Phase Seal Hardening (20260240):
 * - Integrated PII Firewall for comprehensive forbidden field detection
 * - Added semantic smuggling vector detection
 * - Enhanced enforcement mode for maximum protection
 * - Fail-closed: ANY suspicious write is blocked
 */
import { isWriteLocked } from "@/lib/security/killSwitch";
import {
  assertNoPII,
  assertNoPIIInBatch,
  PIIFirewallError,
} from "@/lib/security/piiFirewall";
import { assertSnakeCaseKeys } from "@/lib/safe/dbPayload";

type SupabaseQueryBuilder = {
  insert(values: unknown, options?: unknown): any;
  update(values: unknown, options?: unknown): any;
  upsert(values: unknown, options?: unknown): any;
};

type SupabaseLike = {
  from(table: string): SupabaseQueryBuilder;
};

/** Contract-aligned banned keys (case-insensitive match). No user free-text may be written. */
const BANNED_FIELDS = new Set([
  // Core content fields (original set)
  "content",
  "text",
  "message",
  "note",
  "summary",
  "transcript",
  "journal",
  "response",
  "prompt",
  "narrative",
  "description",
  "body",
  "comment",
  "reflection",
  "entry",
  "reply",
  "answer",
  "reasoning",
  "free_text",
  // Semantic smuggling vectors (hardening additions)
  "detail",
  "details",
  "context",
  "notes",
  "note_text",
  "caption",
  "content_text",
  "contentText",
  "user_input",
  "assistant_output",
  "input",
  "output",
  "raw",
  "payload",
  "message_text",
  "full_text",
]);

/** Tables that must not accept any write until migration (Phase 0 lockdown). Reads remain allowed via fromSafe().
 * Phase 1: memory_chunks removed from blocklist - embeddings allowed (vectors only, no content).
 */
const WRITE_BLOCKED_TABLES = new Set([
  "journal_entries",
  "conversation_messages",
  "check_ins",
  "user_reports",
  "user_nudges",
]);

/** Keys that may contain long strings (e.g. JSON config). All other string values > MAX_STRING_LENGTH are rejected. */
const ALLOWED_LONG_STRING_KEYS_PER_TABLE: Record<string, Set<string>> = {
  admin_ai_config: new Set(["config"]),
  admin_global_config: new Set(["config"]),
  vella_settings: new Set(["voice_hud", "privacy_flags"]),
  behavioural_state_current: new Set(["state_json"]),
  behavioural_state_history: new Set(["state_json"]),
  governance_state: new Set(["state_json"]),
  micro_rag_cache: new Set(["data"]),
  progress_metrics: new Set(["data"]),
  social_models: new Set(["model"]),
  vella_personality: new Set(["traits"]),
};

const MAX_STRING_LENGTH = 500;

export const SafeDataErrorCode = {
  BANNED_FIELD_DETECTED: "BANNED_FIELD_DETECTED",
  WRITE_BLOCKED_TABLE: "WRITE_BLOCKED_TABLE",
} as const;

export type SafeDataErrorCodeType = (typeof SafeDataErrorCode)[keyof typeof SafeDataErrorCode];

export class SafeDataError extends Error {
  constructor(
    public readonly code: SafeDataErrorCodeType,
    message: string,
    public readonly table?: string,
    public readonly key?: string,
  ) {
    super(message);
    this.name = "SafeDataError";
    Object.setPrototypeOf(this, SafeDataError.prototype);
  }
}

function isBannedKey(key: string): boolean {
  return BANNED_FIELDS.has(key.toLowerCase());
}

function mayHaveLongString(table: string, keyPath: string): boolean {
  const lastKey = keyPath.split(".").pop()?.replace(/\[\d+\]$/, "") ?? keyPath;
  const allowed = ALLOWED_LONG_STRING_KEYS_PER_TABLE[table];
  return allowed ? allowed.has(lastKey) : false;
}

function scanPayloadRecursive(
  table: string,
  payload: unknown,
  keyPath: string,
): void {
  if (payload === null || payload === undefined) return;

  if (typeof payload === "string") {
    if (payload.length > MAX_STRING_LENGTH && !mayHaveLongString(table, keyPath)) {
      throw new SafeDataError(
        SafeDataErrorCode.BANNED_FIELD_DETECTED,
        `[SAFE-DATA] String value length ${payload.length} exceeds ${MAX_STRING_LENGTH} for key '${keyPath}' in table '${table}'.`,
        table,
        keyPath,
      );
    }
    return;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item, i) => scanPayloadRecursive(table, item, `${keyPath}[${i}]`));
    return;
  }

  if (typeof payload === "object") {
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (isBannedKey(key)) {
        throw new SafeDataError(
          SafeDataErrorCode.BANNED_FIELD_DETECTED,
          `[SAFE-DATA] Forbidden Supabase field '${key}' for table '${table}'. Free-text fields must remain local (see DATA_DESIGN.md).`,
          table,
          key,
        );
      }
      const val = (payload as Record<string, unknown>)[key];
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      scanPayloadRecursive(table, val, nextPath);
    }
  }
}

function scanPayload(table: string, payload: unknown): void {
  if (!payload) return;
  const rows = Array.isArray(payload) ? payload : [payload];
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    if (!entry || typeof entry !== "object") continue;
    scanPayloadRecursive(table, entry, `row${rows.length > 1 ? `[${i}]` : ""}`);
  }
}

function ensureClient(client?: SupabaseLike | null): SupabaseLike {
  if (client) {
    return client;
  }
  throw new Error("[SAFE-DATA] Supabase client instance is required for safe writes.");
}

function ensureWriteLockAllowed(bypassWriteLock?: boolean): void {
  if (isWriteLocked() && !bypassWriteLock) {
    throw new Error(
      "[SAFE-DATA] WRITE_LOCK_MODE is active. Writes are allowed only from stripe webhook or admin routes."
    );
  }
}

function ensureNotBlockedTable(table: string): void {
  if (WRITE_BLOCKED_TABLES.has(table)) {
    throw new SafeDataError(
      SafeDataErrorCode.WRITE_BLOCKED_TABLE,
      `[SAFE-DATA] Table '${table}' is write-blocked (Phase 0 lockdown). No new text may be written until migration.`,
      table,
    );
  }
}

/**
 * Safely inserts data into Supabase with comprehensive PII protection.
 * Integrates both legacy safe data scanning and new PII Firewall.
 *
 * @param table - Target table name
 * @param payload - Data to insert (object or array of objects)
 * @param options - Supabase insert options
 * @param client - Supabase client instance
 * @param bypassWriteLock - Whether to bypass write lock (for admin/webhook use)
 * @throws SafeDataError | PIIFirewallError if violation detected
 */
export function safeInsert<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);

  // Legacy scan (maintains backward compatibility)
  scanPayload(table, payload);

  // Phase Seal: snake_case contract enforcement (dev-only)
  if (Array.isArray(payload)) {
    payload.forEach((item) => assertSnakeCaseKeys(item as Record<string, any>, table));
  } else {
    assertSnakeCaseKeys(payload as Record<string, any>, table);
  }

  // Phase Seal: PII Firewall integration
  try {
    if (Array.isArray(payload)) {
      assertNoPIIInBatch(payload, table);
    } else {
      assertNoPII(payload, table);
    }
  } catch (error) {
    if (error instanceof PIIFirewallError) {
      // Enhance the error with safe data context
      throw new SafeDataError(
        SafeDataErrorCode.BANNED_FIELD_DETECTED,
        `[SAFE-DATA] PII Firewall blocked write to '${table}': ${error.message}`,
        table,
        error.keyPath,
      );
    }
    throw error;
  }

  return ensureClient(client).from(table).insert(payload, options);
}

/**
 * Safely updates data in Supabase with comprehensive PII protection.
 * Integrates both legacy safe data scanning and new PII Firewall.
 *
 * @param table - Target table name
 * @param payload - Data to update (object or array of objects)
 * @param options - Supabase update options
 * @param client - Supabase client instance
 * @param bypassWriteLock - Whether to bypass write lock (for admin/webhook use)
 * @throws SafeDataError | PIIFirewallError if violation detected
 */
export function safeUpdate<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);

  // Legacy scan (maintains backward compatibility)
  scanPayload(table, payload);

  // Phase Seal: snake_case contract enforcement (dev-only)
  if (Array.isArray(payload)) {
    payload.forEach((item) => assertSnakeCaseKeys(item as Record<string, any>, table));
  } else {
    assertSnakeCaseKeys(payload as Record<string, any>, table);
  }

  // Phase Seal: PII Firewall integration
  try {
    if (Array.isArray(payload)) {
      assertNoPIIInBatch(payload, table);
    } else {
      assertNoPII(payload, table);
    }
  } catch (error) {
    if (error instanceof PIIFirewallError) {
      throw new SafeDataError(
        SafeDataErrorCode.BANNED_FIELD_DETECTED,
        `[SAFE-DATA] PII Firewall blocked update to '${table}': ${error.message}`,
        table,
        error.keyPath,
      );
    }
    throw error;
  }

  return ensureClient(client).from(table).update(payload, options);
}

/**
 * Safely upserts data into Supabase with comprehensive PII protection.
 * Integrates both legacy safe data scanning and new PII Firewall.
 *
 * @param table - Target table name
 * @param payload - Data to upsert (object or array of objects)
 * @param options - Supabase upsert options
 * @param client - Supabase client instance
 * @param bypassWriteLock - Whether to bypass write lock (for admin/webhook use)
 * @throws SafeDataError | PIIFirewallError if violation detected
 */
export function safeUpsert<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);

  // Legacy scan (maintains backward compatibility)
  scanPayload(table, payload);

  // Phase Seal: snake_case contract enforcement (dev-only)
  if (Array.isArray(payload)) {
    payload.forEach((item) => assertSnakeCaseKeys(item as Record<string, any>, table));
  } else {
    assertSnakeCaseKeys(payload as Record<string, any>, table);
  }

  // Phase Seal: PII Firewall integration
  try {
    if (Array.isArray(payload)) {
      assertNoPIIInBatch(payload, table);
    } else {
      assertNoPII(payload, table);
    }
  } catch (error) {
    if (error instanceof PIIFirewallError) {
      throw new SafeDataError(
        SafeDataErrorCode.BANNED_FIELD_DETECTED,
        `[SAFE-DATA] PII Firewall blocked upsert to '${table}': ${error.message}`,
        table,
        error.keyPath,
      );
    }
    throw error;
  }

  return ensureClient(client).from(table).upsert(payload, options);
}

/** Call from routes to return a standard 409 response when server text storage is blocked. */
export function serverTextStorageBlockedResponse(requestId?: string) {
  return new Response(
    JSON.stringify({
      error: {
        code: "SERVER_TEXT_STORAGE_BLOCKED",
        message: "This endpoint is temporarily disabled while privacy migration is in progress.",
        request_id: requestId ?? null,
      },
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Phase Seal: Returns a 403 Forbidden response for PII violations.
 * Use this when the PII Firewall blocks a write.
 */
export function piiViolationResponse(requestId?: string, details?: string) {
  return new Response(
    JSON.stringify({
      error: {
        code: "PII_WRITE_BLOCKED",
        message:
          "This request has been blocked. Personal text cannot be stored server-side per the local-first privacy policy.",
        details: details ?? "Forbidden field detected in payload",
        request_id: requestId ?? null,
      },
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Phase Seal: Validates a payload without performing a write.
 * Returns an object with validation results.
 */
export function validatePayloadForPII(
  table: string,
  payload: Record<string, unknown> | Record<string, unknown>[],
): { valid: boolean; error?: SafeDataError } {
  try {
    ensureNotBlockedTable(table);
    scanPayload(table, payload);
    if (Array.isArray(payload)) {
      assertNoPIIInBatch(payload, table);
    } else {
      assertNoPII(payload, table);
    }
    return { valid: true };
  } catch (error) {
    if (error instanceof SafeDataError) {
      return { valid: false, error };
    }
    if (error instanceof PIIFirewallError) {
      return {
        valid: false,
        error: new SafeDataError(
          SafeDataErrorCode.BANNED_FIELD_DETECTED,
          `PII Firewall: ${error.message}`,
          table,
          error.keyPath,
        ),
      };
    }
    return {
      valid: false,
      error: new SafeDataError(
        SafeDataErrorCode.BANNED_FIELD_DETECTED,
        `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        table,
      ),
    };
  }
}

// Re-export PIIFirewallError for convenience
export { PIIFirewallError };
