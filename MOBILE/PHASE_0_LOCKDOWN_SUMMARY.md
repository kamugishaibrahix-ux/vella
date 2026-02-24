# Phase 0 Server Text Write Lockdown — Summary

## 1) WHAT CHANGED

### Modified files

| File | Change |
|------|--------|
| `MOBILE/lib/safe/safeSupabaseWrite.ts` | Expanded BANNED_FIELDS to contract set; recursive case-insensitive scanPayload; string length > 500 rejected unless allowlisted; SafeDataError (BANNED_FIELD_DETECTED, WRITE_BLOCKED_TABLE); WRITE_BLOCKED_TABLES (Option 2); serverTextStorageBlockedResponse(); allowlist for long strings per table. |
| `MOBILE/lib/supabase/safeTables.ts` | No change (Option 2: tables remain for reads; write block in safeSupabaseWrite). |
| `MOBILE/lib/security/logGuard.ts` | Extended SENSITIVE_KEYS to include note, summary, journal, response, prompt, narrative, description, comment, reflection, entry, reply, answer, reasoning, free_text. |
| `MOBILE/lib/governance/stateEngine.ts` | governance_state write switched to safeUpsert(..., supabaseAdmin). |
| `MOBILE/lib/governance/events.ts` | behaviour_events write switched to safeInsert(..., supabaseAdmin). |
| `MOBILE/lib/engine/behavioural/recomputeState.ts` | behavioural_state_current / behavioural_state_history writes switched to safeUpsert / safeInsert with supabaseAdmin. |
| `MOBILE/app/api/feedback/create/route.ts` | feedback insert switched to safeInsert with supabaseAdmin. |
| `MOBILE/app/api/reports/create/route.ts` | user_reports insert via safeInsert; catch SafeDataError and return serverTextStorageBlockedResponse(). |
| `MOBILE/lib/journal/db.ts` | createJournalEntryInDb / updateJournalEntryInDb use safeInsert / safeUpdate with supabaseAdmin (throw for WRITE_BLOCKED_TABLE). |
| `MOBILE/lib/checkins/db.ts` | createCheckInInDb / updateCheckInInDb use safeInsert / safeUpdate with supabaseAdmin (throw for WRITE_BLOCKED_TABLE). |
| `MOBILE/lib/conversation/db.ts` | insertConversationMessage uses safeInsert with supabaseAdmin (throw for WRITE_BLOCKED_TABLE). |
| `MOBILE/lib/memory/db.ts` | upsertChunksForSource / markChunkEmbedded use safeUpsert / safeUpdate with supabaseAdmin (throw for WRITE_BLOCKED_TABLE). |
| `MOBILE/lib/payments/webhookIdempotency.ts` | markEventProcessed uses safeInsert("webhook_events", ...) instead of fromSafe().insert(). |
| `MOBILE/lib/budget/usageServer.ts` | recordUsageToSupabase uses safeInsert("token_usage", ...) with supabaseAdmin. |
| `MOBILE/app/api/journal/route.ts` | POST/PUT/PATCH catch SafeDataError (WRITE_BLOCKED_TABLE) and return serverTextStorageBlockedResponse(). |
| `MOBILE/app/api/check-ins/route.ts` | POST/PATCH catch SafeDataError and return serverTextStorageBlockedResponse(). |
| `MOBILE/app/api/vella/text/route.ts` | All insertConversationMessage calls inside try; catch SafeDataError and return serverTextStorageBlockedResponse(requestId). |
| `MOBILE/app/api/memory/chunk/route.ts` | Catch SafeDataError and return serverTextStorageBlockedResponse(). |
| `MOBILE/app/api/memory/reindex/route.ts` | Catch SafeDataError and return serverTextStorageBlockedResponse(). |
| `MOBILE/app/api/memory/embed/route.ts` | Catch SafeDataError and return serverTextStorageBlockedResponse(). |
| `MOBILE/package.json` | check:data now runs `node ../scripts/checkPhase0Lockdown.mjs`. |
| `scripts/checkPhase0Lockdown.mjs` | **New.** Fails build on fromSafe("...").(insert|update|upsert)(, supabase.from("...").(insert|update|upsert)(, and console.log/error with req.body/request.body/res.body/response.body. |
| `scripts/checkForbiddenPatterns.ts` | EXCLUDED_FILES for chunking.ts and cadenceEngine.ts (false positives). |
| `scripts/scanSupabaseTables.mjs` | journal_entries and conversation_messages removed from PERSONAL_TABLES (write-blocked at runtime; reads allowed). |

Stripe webhook (`MOBILE/app/api/stripe/webhook/route.ts`) unchanged: already uses safeInsert/safeUpdate with supabaseAdmin and bypassWriteLock.

---

## 2) Endpoints now blocked (return 409)

| Endpoint | Method | Error response |
|----------|--------|----------------|
| `/api/journal` | POST | 409, `{ error: { code: "SERVER_TEXT_STORAGE_BLOCKED", message: "This endpoint is temporarily disabled while privacy migration is in progress.", request_id: null } }` |
| `/api/journal` | PUT | 409, same body |
| `/api/journal` | PATCH | 409, same body |
| `/api/check-ins` | POST | 409, same body |
| `/api/check-ins` | PATCH | 409, same body |
| `/api/vella/text` | POST | 409, same body (with request_id when available) |
| `/api/reports/create` | POST | 409, same body |
| `/api/memory/chunk` | POST | 409, same body (service-key route) |
| `/api/memory/reindex` | POST | 409, same body (service-key route) |
| `/api/memory/embed` | POST | 409, same body (service-key route) |

All use HTTP status **409** and error code **SERVER_TEXT_STORAGE_BLOCKED**. Request body is not logged.

---

## 3) Remaining known violations vs Master Plan (intentionally deferred)

- **Dexie / local-first:** Not implemented. Journal, conversation, check-ins, memory, and user_reports content are still stored in Supabase schema; only *writes* are blocked. Reads still hit Supabase. Dexie and on-device storage are out of scope for Phase 0.
- **Migration (M3/M4):** No migration_started_at, migration_completed_at, migration_checksum, or purge gate. Deferred to migration phase.
- **Schema cleanup:** Content columns (e.g. journal_entries.content, conversation_messages.content) remain in schema; no DROP or table removal in Phase 0.
- **Centralized validation middleware:** No single middleware applied to all API routes; validation remains per-route. BANNED_FIELDS and WRITE_BLOCKED_TABLES enforce at safe* layer.
- **CI:** Phase 0 lockdown script runs in check:data; Stripe webhook behaviour unchanged and should be re-verified manually or via existing tests.
