/**
 * SAFE DATA WRITERS
 * - Guards against persisting free-text fields to Supabase.
 * - Callers must provide the appropriate Supabase client (browser or admin).
 * - When WRITE_LOCK_MODE=true, writes throw unless bypassWriteLock is true (e.g. stripe webhook).
 *
 * Phase 0: Option 2 — WRITE_BLOCKED_TABLES. Content tables remain in SAFE_TABLES so reads
 * (fromSafe().select()) still work. Writes to journal_entries, conversation_messages, check_ins,
 * memory_chunks, user_reports are blocked here with WRITE_BLOCKED_TABLE so no new text can be
 * written. Removing those tables from SAFE_TABLES would break existing read paths (e.g. state
 * recompute, memory search) before Dexie migration; Option 2 minimises breakage while guaranteeing
 * no new server text writes.
 */
import { isWriteLocked } from "@/lib/security/killSwitch";

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
]);

/** Tables that must not accept any write until migration (Phase 0 lockdown). Reads remain allowed via fromSafe(). */
const WRITE_BLOCKED_TABLES = new Set([
  "journal_entries",
  "conversation_messages",
  "check_ins",
  "memory_chunks",
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

export function safeInsert<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);
  scanPayload(table, payload);
  return ensureClient(client).from(table).insert(payload, options);
}

export function safeUpdate<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);
  scanPayload(table, payload);
  return ensureClient(client).from(table).update(payload, options);
}

export function safeUpsert<T extends Record<string, unknown> | Record<string, unknown>[]>(
  table: string,
  payload: T,
  options?: unknown,
  client?: SupabaseLike | null,
  bypassWriteLock?: boolean,
) {
  ensureWriteLockAllowed(bypassWriteLock);
  ensureNotBlockedTable(table);
  scanPayload(table, payload);
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
