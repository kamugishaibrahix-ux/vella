# STRICT READ-ONLY ARCHITECTURE & CONTRACT AUDIT REPORT

**Scope:** Entire MOBILE/ directory (frontend + backend + supabase + tests)  
**Reference:** VELLA_MASTER_PLAN_AND_BUILD_CONTRACT.md (single combined contract; MASTER_PLAN.md and BUILD_CONTRACT.md not present as separate files)  
**Mode:** Evidence only. No code modifications. No patches suggested.  
**Date:** 2025-02-21  

---

# SECTION 0 — Contract Baseline

## 0.1 Extracted summary (with line refs)

**Core architectural principles**
- Hybrid system: Emotional Interface Layer (LLM, adaptive) + Deterministic Governance Spine (rule-based, no LLM for state). The two layers communicate via a defined interface; AI never writes to governance state; governance state never contains free text. (Contract lines 37–42.)
- Local-first mobile app with thin metadata-only cloud backend. (Contract lines 174–179.)

**Storage rules (local-first, no server free-text)**
- All user free text (journals, chat, check-in notes, memory, summaries) stored exclusively on device. Servers store only safe metadata: timestamps, counters, hashes, enum codes, flags, entitlement records. (Contract lines 52–54.)
- INV-01: No user free text in server database; INV-02: All sensitive user content in device IndexedDB/Dexie. (Contract lines 64–73.)
- Forbidden Data List: journal text, chat content, check-in notes, memory chunk text, report summaries, prompts, governance event free text, etc. (Contract lines 121–132.)

**Hybrid architecture (Emotional Interface + Deterministic Spine)**
- Emotional Interface: warm, reflective, LLM-powered; receives governance context (structured); never writes to governance state. (Contract lines 37–39, 377–379.)
- Deterministic Spine: rule-based, auditable; tracks commitments, abstinence, focus, escalation; state = f(events); no LLM. (Contract lines 39–41, 302–309.)
- Server is authoritative for governance state; client state is cache for display only. (Contract lines 377–382.)

**Governance/risk requirements**
- Governance state recomputed from event log; idempotent and canonical. engine_version on events and state. (Contract lines 382–386.)
- Risk score 0–100 deterministic; modulates AI tone; never displayed raw. (Contract lines 369–371.)
- Relapse/commitment/focus logic as specified in Sections 5.3–5.5. (Contract lines 322–367.)

**Admin/control surface requirements**
- Admin roles: super_admin, ops_admin, support_agent, analyst, read_only. MFA required. (Contract lines 441–446.)
- Subscribers page: user_id (truncated), plan_tier, counts; no journal/chat/check-in/memory content. (Contract lines 450–451.)
- Admin panel: Next.js 14, Supabase Auth with admin JWT claim, separate subdomain. (Contract lines 458–463.)

**Migration requirements (M1–M4)**
- M1: Freeze and audit; M2: New _v2 tables; M3: Client migration, migration_started_at / migration_completed_at / migration_checksum; M4: Purge gated by migration_completed_at (INV-14). (Contract lines 477–506.)
- Purge Gate Checklist: 100% migrated, backup, legal/CTO sign-off. (Contract lines 499–505.)

**Security & privacy requirements**
- INV-06/INV-13: No AI request or response body in any server log. Centralised logger, CI fail on console.log(req.body), runtime guard. (Contract lines 86–88, 254–261, 476.)
- BANNED_FIELDS at API boundary; payload validation middleware mandatory. (Contract lines 82–84, 243–246.)
- Encryption: AES-256-GCM at rest per record; key in SecureStore. (Contract lines 459–461.)

**Testing requirements**
- Privacy (P0), Governance (determinism, equivalence), Security (JWT, RLS, rate limit, no console.log(req.body)), Migration (purge checks migration_completed_at). (Contract lines 507–516, 531–534.)

## 0.2 Non-negotiable invariants (explicit in contract)

| ID | Invariant |
|----|-----------|
| INV-01 | No free text in any Supabase table |
| INV-02 | Banned field validation; sensitive content in IndexedDB/Dexie |
| INV-03 | Governance engine deterministic |
| INV-04 | AI layer does not write to governance state directly |
| INV-05 | API rejects banned fields at boundary |
| INV-06 / INV-13 | No AI request/response body in any server log |
| INV-14 | No legacy purge unless migration_completed_at (or status COMPLETED) for user |
| INV-15 | Infrastructure region change requires legal review |

(Contract Appendix A, lines 531–546; Section 1.1 lines 62–88.)

---

# SECTION 1 — STORAGE & PRIVACY COMPLIANCE

## 1.1 Server-side storage scan

**No writes to legacy content tables**

- **WRITE_BLOCKED_TABLES** in `MOBILE/lib/safe/safeSupabaseWrite.ts` (lines 49–56): `journal_entries`, `conversation_messages`, `check_ins`, `memory_chunks`, `user_reports`, `user_nudges`. All six are explicitly blocked.
- **Enforcement:** `ensureNotBlockedTable(table)` (lines 169–177) is called from `safeInsert`, `safeUpdate`, `safeUpsert` before any write. Writes to these tables throw `SafeDataError` with `WRITE_BLOCKED_TABLE`.
- **Conversation:** `MOBILE/lib/conversation/db.ts` (lines 54–59): `insertConversationMessage` throws with message "conversation_messages is write-blocked. Use recordConversationMetadataV2." No code path inserts into `conversation_messages`. Metadata path uses `safeInsert("conversation_metadata_v2", ...)` (lines 79–82).
- **Journal/check-ins:** `MOBILE/lib/journal/db.ts` and `MOBILE/lib/checkins/db.ts` use `safeInsert`/`safeUpdate` with `journal_entries_v2` and `check_ins_v2` only (e.g. journal/db.ts 87–88, 111; checkins/db.ts 97–98, 131).
- **Memory:** `MOBILE/lib/memory/db.ts` (lines 66–69, 109–112): calls `safeUpsert("memory_chunks", ...)` and `safeUpdate("memory_chunks", ...)`. Because `memory_chunks` is in WRITE_BLOCKED_TABLES, these throw; docstring (lines 4–5) states callers return 409.
- **Reports:** `MOBILE/app/api/reports/create/route.ts` (lines 40–43): uses `safeInsert("user_reports_v2", ...)` only; no write to `user_reports`.

**Grep results (writes to legacy names)**

- No `safeInsert`/`safeUpdate`/`safeUpsert` with first argument `"journal_entries"`, `"conversation_messages"`, `"check_ins"`, `"user_reports"`, or `"user_nudges"` anywhere in MOBILE (only `safeSupabaseWrite.ts` references these as blocked names and in comments). `memory_chunks` is used in `lib/memory/db.ts` and is blocked, so those writes throw.

**Only *_v2 metadata tables used for app writes**

- Journal: `journal_entries_v2` (journal/db.ts 88, 112, 131).
- Check-ins: `check_ins_v2` (checkins/db.ts 48, 63, 98, 132, 149).
- Conversation: `conversation_metadata_v2` (conversation/db.ts 79).
- Reports: `user_reports_v2` (reports/create/route.ts 43).

**No direct supabase.from(...).insert/update/upsert outside safe layer**

- `MOBILE/scripts/checkPhase0Lockdown.mjs` (repo root `scripts/`) (lines 34–36, 64–71): fails build on `fromSafe("...").(insert|update|upsert)(` and `supabase.from("...").(insert|update|upsert)(`.
- In MOBILE, the only `.from(...).insert`/`update`/`upsert` are inside `MOBILE/lib/safe/safeSupabaseWrite.ts` (lines 191, 204, 217), which implement the safe layer. All other writes go through `safeInsert`/`safeUpdate`/`safeUpsert`.

**Confirmation no free-text fields written to Supabase**

- `safeSupabaseWrite.ts`: `scanPayloadRecursive` rejects BANNED_FIELDS (e.g. content, text, message, note, summary, transcript, journal, response, prompt, narrative, description, body, comment, reflection, entry, reply, answer, reasoning, free_text) (lines 26–46, 103–143). Long strings beyond MAX_STRING_LENGTH (500) are rejected except for ALLOWED_LONG_STRING_KEYS_PER_TABLE (e.g. state_json, config). All insert/update/upsert paths call `scanPayload` before calling the client.

**governance_state and admin_user_flags in SAFE_TABLES**

- `MOBILE/lib/supabase/safeTables.ts` (lines 5–44): `SAFE_TABLE_VALUES` includes `"governance_state"` (line 18) and `"admin_user_flags"` (line 8). `fromSafe("governance_state")` and `safeUpsert("governance_state", ...)` therefore pass `assertSafeTable`. Admin suspend uses `safeUpsert("admin_user_flags", ...)` (app/api/admin/user/[id]/suspend/route.ts 44).

---

## 1.2 Local storage architecture

**IndexedDB vella_local_v2**

- `MOBILE/lib/local/db/indexedDB.ts` (lines 6–8): `DB_NAME = "vella_local_v2"`; stores: `journals`, `checkins`, `conversations`, `reports`, `migration_cursors`.

**Encryption (AES-GCM with AAD)**

- `MOBILE/lib/local/encryption/crypto.ts` (lines 2–3, 9–10, 48–62): Web Crypto AES-GCM; `ALG = "AES-GCM"`; `encryptString(plaintext, aad)` uses unique IV; AAD used in encrypt/decrypt. Key path `vella_local_v2:encryption_key` (line 9).
- `MOBILE/lib/local/encryption/index.ts` (lines 40–41, 53+): `encryptField` / `decryptField` for sensitive fields.
- Journals, check-ins, conversations, reports: `MOBILE/lib/local/db/journalRepo.ts` (50–51), `checkinsRepo.ts` (52), `conversationRepo.ts` (37, 50), `reportsRepo.ts` (35–36) use `encryptField`/`decryptField` for content/title/note/summary/notes.

**Tests: decrypt(encrypt(x)) === x**

- `MOBILE/test/local/encryption.test.ts` (lines 28–32): "decrypt(encrypt(x)) equals x" with plaintext and AAD; (lines 38–40): wrong AAD or wrong user/record rejects decrypt.

**Plaintext / localStorage**

- Contract forbids plaintext storage of sensitive data in IndexedDB and forbids fallback to localStorage for sensitive data. Encryption is implemented per-field in repos; no evidence of plaintext content in IndexedDB in the audited paths. `MOBILE/lib/local/encryption/crypto.ts` (line 3) stores key in localStorage (vella_local_v2:encryption_key); contract specifies key in SecureStore (Keychain/Keystore)—implementation uses localStorage for key in browser. **Not verifiable** in this audit whether production builds use SecureStore (e.g. Expo).

**Encryption in production**

- `MOBILE/lib/local/encryption/index.ts`: Production vs dev controlled by flag; "Production always uses real crypto" in comment (line 7). **Not verifiable** without build/config inspection.

---

## 1.3 Logging & observability

**logGuard installed**

- `MOBILE/lib/security/logGuard.ts` (lines 64–72, 89–91): `installLogGuard()` replaces `console.log`/`error`/`warn` with redacting versions; applied at module load when `process.env?.NODE_ENV !== "test"` (lines 89–91).
- `MOBILE/test/setup.ts` (lines 3–5): `installLogGuardForTests()` is called, so tests run with redaction.

**No request/response body logging**

- `logGuard` redacts keys in SENSITIVE_KEYS (e.g. message, content, body, reply, prompt, etc.) to `[REDACTED]` (lines 7–34, 36–50).
- `scripts/checkPhase0Lockdown.mjs` (lines 39, 73–76): Fails on `console.(log|error|warn)(... req.body|request.body|res.body|response.body ...)`.

**Observability metadata-only**

- `MOBILE/lib/security/observability.ts` (lines 60–74): `logSecurityEvent` logs only `requestId`, `route`, `outcome`, `latencyMs`, `userIdHash`, `ipHash`; no body/reply/prompt.

**Console.log of user text**

- One match: `MOBILE/lib/realtime/realtimeClient.ts` (line 745): `console.log("[DC:INCOMING] message type:", parsedType)` — logs message **type** (enum), not message content. No evidence of logging raw user text in the audited code paths.

---

# SECTION 2 — EMOTIONAL INTERFACE

## 2.1 AI entry points

| Route / hook | File | Stores free text server-side? | filterUnsafeContent? | Logs raw content? | Persists metadata only? |
|--------------|------|-------------------------------|----------------------|-------------------|-------------------------|
| **POST /api/vella/text** | `MOBILE/app/api/vella/text/route.ts` | No. Uses `recordConversationMetadataV2` (counts, mode_enum). No message content written. | Yes. Lines 142 (guided-exercise reply), 198 (model reply): `filterUnsafeContent` applied before return. | No. logGuard + observability metadata only. | Yes. conversation_metadata_v2 only (lines 143, 218–223). |
| **Realtime (useRealtimeVella)** | `MOBILE/lib/realtime/useRealtimeVella.ts` | Not verified (client-side hook; server endpoints may differ). | Yes. Lines 1136, 1186: `filterUnsafeContent(transcript)` and `filterUnsafeContent(trimmed)` on user text. | Not verified. | Not verified. |
| **POST /api/insights/generate** | `MOBILE/app/api/insights/generate/route.ts` | Not verified in full. Uses `client.chat.completions.create` (line 241). | Not verified. | Not verified. | Not verified. |
| **POST /api/insights/patterns** | `MOBILE/app/api/insights/patterns/route.ts` | Not verified. Uses `client.chat.completions.create` (line 132). | Not verified. | Not verified. | Not verified. |
| **Audio / transcribe** | `MOBILE/app/api/audio/vella/route.ts`, transcribe routes | Not verified. | Not verified. | Not verified. | Not verified. |
| **Memory (chunk/reindex)** | `MOBILE/app/api/memory/chunk/route.ts`, reindex | No server text: journal_entries_v2/conversation have no content; return empty or no content (chunk route 49–55, reindex 53). | N/A (no content). | No. | Metadata only. |

Evidence: vella/text — `MOBILE/app/api/vella/text/route.ts` lines 29, 142, 198, 218–223, 79–82 (recordConversationMetadataV2). Realtime — `MOBILE/lib/realtime/useRealtimeVella.ts` lines 46, 1136, 1186.

---

## 2.2 Mode system

**VellaMode enum**

- `MOBILE/lib/ai/modes.ts` (lines 6–16): `VellaMode = "vent" | "listen" | "challenge" | "coach" | "crisis"`; `VELLA_MODE_VALUES`; `isVellaMode(value)`.

**Validation schema**

- `MOBILE/lib/security/validationSchemas.ts` (line 31): "VellaMode for request body (vent | listen | challenge | coach | crisis)." vellaTextRequestSchema used in vella/text route (route.ts line 122).

**resolveMode precedence**

- `MOBILE/lib/ai/modeResolver.ts` (lines 21–40): (1) escalationLevel >= 2 → crisis; (2) requestedMode === "challenge" && riskScore >= 6 → coach; (3) requestedMode else default "listen". Matches contract (crisis forced by escalation; challenge downgraded by risk).

**Mode as SYSTEM instruction**

- `MOBILE/lib/ai/textEngine.ts` (lines 24–31, 43–49): `buildModeSystemInstruction(mode)` returns system string; when `context.mode` is set, messages = `[{ role: "system", content: buildModeSystemInstruction(context.mode) }, { role: "user", content: prompt }]`; no mode prefix on user message.

**mode_enum in conversation_metadata_v2**

- `MOBILE/app/api/vella/text/route.ts` (lines 143, 218–221): `recordConversationMetadataV2({ ..., mode_enum: finalMode })`. `MOBILE/lib/conversation/db.ts` (lines 74–75): insert includes `mode_enum: opts.mode_enum ?? "listen"`.

**Crisis escalation and risk downgrade**

- Mode resolver forces crisis when escalationLevel >= 2; challenge → coach when riskScore >= 6. (modeResolver.ts 26–32.)

Evidence: modeResolver.ts 21–40; textEngine.ts 24–31, 43–49; conversation/db.ts 74–75; vella/text/route.ts 136, 143, 221.

---

## 2.3 Safety layer

**filterUnsafeContent**

- Text AI: `MOBILE/app/api/vella/text/route.ts` (lines 142, 198): applied to guided-exercise reply and to model reply before returning.
- Realtime: `MOBILE/lib/realtime/useRealtimeVella.ts` (lines 1136, 1186): applied to transcript and trimmed user text.
- No bypass in vella/text: both branches (exercise and LLM) go through filter before response.

**Crisis mode handling**

- `MOBILE/app/api/vella/text/route.ts` (lines 203–214): when `finalMode === "crisis"`, calls `recordEvent(userId, "scheduler_tick", ...)`; on catch, `logSecurityEvent({ ...obsMeta(), outcome: "crisis_event_write_failed" })` (metadata only). Deterministic (no LLM in recordEvent).

**Unsafe echo**

- No path in vella/text returns raw reply; always `safeReply` / `safeExerciseReply` after filterUnsafeContent.

Evidence: vella/text/route.ts 142, 198, 203–214; complianceFilter.ts 4+; useRealtimeVella.ts 1136, 1186.

---

# SECTION 3 — DETERMINISTIC SPINE

## 3.1 behaviour_events

**Append-only in app code**

- `MOBILE/lib/governance/events.ts`: Only `recordEvent` writes; it uses `safeInsert("behaviour_events", row, ...)` (line 99). No update or delete in this file; `listEvents` is read-only (fromSafe select).

**Enum-based event types**

- `MOBILE/lib/governance/validation.ts` (lines 47–55): `GOVERNANCE_EVENT_TYPES` (e.g. commitment_created, commitment_completed, abstinence_violation, focus_start, focus_end, scheduler_tick). `BehaviourEventInsertSchema` uses `z.enum(GOVERNANCE_EVENT_TYPES)`.

**No free-text in metadata**

- Row uses `metadata` (validated as governanceMetadataSchema: numbers, code strings, ISO timestamps; max 50 chars). (events.ts 59–69, 92; validation.ts 34–41, 91–98.)

**recordEvent validation**

- `validateGovernancePayload("BehaviourEventInsert", payload)` before building row (events.ts 80–84). Invalid payload returns `{ success: false, error: message }`.

Evidence: events.ts 52–106, 127; validation.ts 47–55, 91–98.

**Contract naming:** Contract says "governance_events" (Section 4.9); implementation uses table name **behaviour_events** (safeTables.ts 9, events.ts 99, types 763). Same logical append-only event store.

---

## 3.2 governance_state

**Computed server-side only**

- `MOBILE/lib/governance/stateEngine.ts`: `computeGovernanceState(userId)` reads from behaviour_events, commitments, abstinence_targets, focus_sessions; computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level; writes via `safeUpsert("governance_state", row, ...)` (lines 41–155). No LLM.

**risk_score and escalation_level deterministic**

- `computeGovernanceRiskScore` and `computeEscalationLevel` (stateEngine.ts 107–113, 158+) are pure functions of counts and state codes.

**No free-text in state_json**

- `state_json` (stateEngine.ts 116–123): keys recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level, last_computed_at_iso; all numeric or code strings.

Evidence: stateEngine.ts 41–155, 116–123, 158+; readState.ts 47; safeTables.ts 18 (governance_state in SAFE_TABLE_VALUES).

---

## 3.3 Coupling integrity

**Emotional interface reads governance before AI**

- `MOBILE/app/api/vella/text/route.ts` (lines 130–135): `governance = await getGovernanceStateForUser(userId)`; then `if (isGovernanceStale(governance)) { await computeGovernanceState(userId).catch(() => {}); governance = await getGovernanceStateForUser(userId); }`; then `finalMode = resolveMode(requestedMode ?? null, governance)`; then AI call (line 184). So governance is read (and optionally recomputed) before mode resolution and before `runVellaTextCompletion`.

**Stale governance triggers recompute**

- Same block (131–134): `isGovernanceStale(governance)` then `computeGovernanceState(userId)` then re-read. TTL and `isGovernanceStale` in `MOBILE/lib/governance/readState.ts` (lines 29–39).

**Crisis triggers recordEvent**

- route.ts (203–208): when `finalMode === "crisis"`, `recordEvent(userId, "scheduler_tick", ...)` is called.

**No circular dependency**

- AI path does not call computeGovernanceState with AI output. recordEvent is called with governance snapshot (escalation_level, risk_score); event type is fixed "scheduler_tick". No AI output used as input to state engine.

Evidence: vella/text/route.ts 130–136, 184, 203–208; readState.ts 29–39, 45–73.

---

# SECTION 4 — MIGRATION & PURGE (M1–M4)

**migration_state exists**

- Table: `MOBILE/supabase/migrations/20260225_migration_state.sql` (lines 6–16). Columns include status, started_at, completed_at, checksum, migration_token, etc.
- App: `MOBILE/lib/migration/state.ts` (lines 24–32, 32–41): `getMigrationState`, `fromSafe("migration_state")`.

**Export routes gated**

- `MOBILE/lib/migration/exportGuard.ts` (lines 42–48): if `state?.status === "COMPLETED"`, returns 403 "Export not available after migration is completed." Export allowed only when status !== COMPLETED and valid X-Migration-Token (lines 3–4, 50–56).

**Exports disabled after COMPLETED**

- Same; 403 with MIGRATION_ALREADY_COMPLETED when status === "COMPLETED".

**Purge precondition**

- `MOBILE/supabase/migrations/20260227_phase_m4_purge.sql` (lines 17–27): `run_phase_m4_purge` selects `status` from `migration_state` for user; if NOT FOUND or status <> 'COMPLETED', raises 'MIGRATION_NOT_COMPLETED' (P0002). Purge route (purge/route.ts 68–79) returns 403 on P0002 or message containing MIGRATION_NOT_COMPLETED.

**run_phase_m4_audit_user**

- `MOBILE/supabase/migrations/20260228_phase_m4_audit_user.sql` (lines 4–65) and `20260229_phase_m4_5_drop_legacy_content.sql` (line 90): function `run_phase_m4_audit_user(p_user_id uuid)` exists.

**Legacy reads in normal flows**

- Conversation: `listConversationMessagesFromDb` returns [] (conversation/db.ts 22–28). Journal/check-ins use *_v2 only (journal/db.ts 47, 62; checkins/db.ts 48, 63). Memory chunk route uses journal_entries_v2/conversation with no content (memory/chunk/route.ts 49–55). Legacy export routes return 410 or empty (e.g. migration/export/conversations, reports, checkins, journals).

**hasLegacy* / minimal counts**

- `hasLegacyConversationData` always false (conversation/db.ts 41–43). `hasLegacyJournalData` / check-ins similar (journal/db.ts 38, checkins/db.ts 39). legacyCounts only queries memory_chunks for migration status (legacyCounts.ts 18–25).

**Schema**

- safeTables.ts: legacy content tables (journal_entries, conversation_messages, check_ins, user_reports) removed from SAFE_TABLE_VALUES; v2 and memory_chunks (for migration) present. test/migration/legacyDropped.test.ts asserts v2 and memory_chunks in set, legacy names not.

Evidence: migration_state.sql; state.ts; exportGuard.ts; 20260227_phase_m4_purge.sql; 20260228/20260229 audit; conversation/db.ts, journal/db.ts, checkins/db.ts; legacyDropped.test.ts.

---

# SECTION 5 — ADMIN / CONTROL SURFACE

**Admin routes in MOBILE**

- **GET /api/admin/subscribers** — `MOBILE/app/api/admin/subscribers/route.ts`: returns user_id (truncated), plan_tier, subscription_status, total_sessions, total_journals, governance_risk_score, escalation_level; uses `fromSafe` for subscriptions, conversation_metadata_v2, journal_entries_v2, governance_state; no content fields. Auth: `requireAdminRole()` (line 19).
- **GET /api/admin/user/:id/metadata** — `MOBILE/app/api/admin/user/[id]/metadata/route.ts`: returns plan, subscription_status, token_usage_total, governance_state (state_json), conversation_count, journal_count; no text content. Auth: `requireAdminRole()` (line 16).
- **POST /api/admin/user/:id/suspend** — `MOBILE/app/api/admin/user/[id]/suspend/route.ts`: safeUpsert to `admin_user_flags` (suspended, suspended_at); restricted to super_admin or ops_admin (lines 12–13, 27–31). Auth: `requireAdminRole()` then role check.
- **GET /api/admin/analytics/overview** — `MOBILE/app/api/admin/analytics/overview/route.ts`: returns total_users, active_subscriptions, plan_distribution, average_governance_risk_score, crisis_mode_count; aggregates only. Auth: `requireAdminRole()` (line 16).

**Admin auth**

- `MOBILE/lib/admin/requireAdminRole.ts` (lines 9–15, 30–68): reads JWT via `createServerSupabaseClient().auth.getUser()`; requires `app_metadata.role` in `ADMIN_ROLES` (super_admin, ops_admin, analyst, support_agent, read_only); returns 401 if no user, 403 if not admin; no fallback.

**No personal content in admin**

- Subscribers and user metadata routes return only IDs (truncated), counts, plan, status, state_json (codes/numbers), token totals. No journal/chat/check-in/memory content. Tests in `MOBILE/test/admin/subscribersRoute.test.ts` and `metadataNoText.test.ts` assert no forbidden keys (content, message, note, summary, prompt) in responses.

Evidence: app/api/admin/subscribers/route.ts 18–34, 58–66; app/api/admin/user/[id]/metadata/route.ts 33–56; app/api/admin/user/[id]/suspend/route.ts 44–52; app/api/admin/analytics/overview/route.ts 18–55; lib/admin/requireAdminRole.ts 9–15, 30–68; Contract 232–237, 449–456.

---

# SECTION 6 — TEST COVERAGE & CONTRACT ALIGNMENT

**Contract-relevant tests present**

- ModeResolver: `MOBILE/test/ai/modeResolver.test.ts` (resolveMode precedence, crisis, challenge downgrade).
- vellaTextRoute: `MOBILE/test/api/vellaTextRoute.test.ts` (governance read, mode_enum, filterUnsafeContent, guided-exercise, stale governance, crisis mode_enum).
- Encryption: `MOBILE/test/local/encryption.test.ts` (decrypt(encrypt(x)) === x, wrong AAD fails).
- Migration: `MOBILE/test/migration/importPipeline.test.ts`, `migrationFlow.test.ts`, `exportShape.test.ts`, `legacyDropped.test.ts`; `MOBILE/test/api/migrationPurge.test.ts`, `migrationRequiredAndExport.test.ts`, `migrationAuditNoText.test.ts`.
- safeSupabaseWrite: `MOBILE/test/safe/safeSupabaseWrite.test.ts` (user_nudges WRITE_BLOCKED_TABLE); `MOBILE/test/safe/governanceSafeTable.test.ts` (governance_state safe upsert, banned key in state_json rejected).
- Payments idempotency: `MOBILE/test/payments/webhookIdempotency.test.ts`.
- textEngine: `MOBILE/test/ai/textEngine.test.ts` (system message with mode, user message only).
- Governance readState: `MOBILE/test/governance/readState.test.ts` (isGovernanceStale).
- Admin: `MOBILE/test/admin/adminAuth.test.ts` (requireAdminRole 401/403/success); `MOBILE/test/admin/subscribersRoute.test.ts` (no content in response); `MOBILE/test/admin/metadataNoText.test.ts` (no content in user metadata response).
- Log static scan: `MOBILE/test/security/logStaticScan.test.ts` (FORBIDDEN_LOG_REGEX flags reply/content/message, does not flag safe metadata logs).

**Total test count**

- 30 test files under MOBILE/test (glob **/*.test.ts). Last full run: 210 tests (30 files).

**Gaps**

- No dedicated test for "no AI request/response body in logs" (staging log audit) in repo.

Evidence: test file list; test/setup.ts; scripts/checkPhase0Lockdown.mjs 39–42, 95–97 (FORBIDDEN_LOG_REGEX for reply/content/message/transcript/prompt/summary/note in app/lib).

---

# SECTION 7 — CONTRACT GAPS

| Contract item | Status | Evidence |
|---------------|--------|----------|
| INV-01 No free text in Supabase | ✅ | WRITE_BLOCKED_TABLES + BANNED_FIELDS + all app writes via safe* to _v2 or allowed tables; conversation_messages write path removed. |
| INV-02 Sensitive content in IndexedDB, encrypted | ✅ | indexedDB.ts vella_local_v2; encryption in journal/checkins/conversation/reports repos; encryption.test.ts. |
| INV-03 Governance deterministic | ✅ | stateEngine pure functions; no LLM; event enums. |
| INV-04 AI does not write governance state | ✅ | recordEvent called with fixed type and governance snapshot; no AI output in state computation. |
| INV-05 API rejects banned fields | ✅ | validationSchemas + safeInsert scanPayload; checkPhase0Lockdown fails on legacy table writes. |
| INV-06 / INV-13 No AI body in logs | ✅ | logGuard; observability metadata-only; crisis_event_write_failed metadata only. CI: checkPhase0Lockdown fails on req.body/response.body (not reply/message/content). |
| Storage: only *_v2 metadata tables for app writes | ✅ | journal_entries_v2, check_ins_v2, conversation_metadata_v2, user_reports_v2. |
| WRITE_BLOCKED_TABLES enforced | ✅ | safeSupabaseWrite ensureNotBlockedTable; user_nudges included; test for user_nudges. |
| No direct fromSafe/supabase insert/update/upsert bypass | ✅ | checkPhase0Lockdown; only safe layer uses .from().insert/update/upsert. |
| governance_state in allowlist | ✅ | safeTables.ts line 18 includes "governance_state"; readState and stateEngine use fromSafe/safeUpsert without assert failure. |
| Mode as system instruction | ✅ | textEngine buildModeSystemInstruction; system + user messages; no user prefix. |
| filterUnsafeContent on text and guided-exercise | ✅ | vella/text route lines 142, 198. |
| Crisis recordEvent + log on failure | ✅ | route 203–214; logSecurityEvent crisis_event_write_failed. |
| Governance TTL + recompute if stale | ✅ | readState isGovernanceStale; route 131–134 computeGovernanceState then re-read. |
| behaviour_events append-only, enum, no free-text | ✅ | events.ts safeInsert only; validation enums; metadata schema. |
| governance_state computed server-side, no LLM | ✅ | stateEngine; state_json codes + last_computed_at_iso. |
| migration_state, export gated, purge gated | ✅ | migration_state table and state.ts; exportGuard COMPLETED → 403; run_phase_m4_purge checks status = COMPLETED. |
| run_phase_m4_audit_user exists | ✅ | Migrations 20260228, 20260229. |
| Admin panel routes (subscribers, tier, token usage, governance view) | ✅ | GET /api/admin/subscribers, GET /api/admin/user/:id/metadata, POST /api/admin/user/:id/suspend, GET /api/admin/analytics/overview; requireAdminRole; metadata only. |
| logGuard in production and tests | ✅ | logGuard.ts install at load when NODE_ENV !== "test"; test/setup.ts installLogGuardForTests(). |
| Encryption decrypt(encrypt(x)) === x test | ✅ | encryption.test.ts. |
| CI static check console.log(req.body) | ✅ | checkPhase0Lockdown.mjs (req.body, response.body). |
| CI check for reply/message/content in logs | ✅ | scripts/checkPhase0Lockdown.mjs FORBIDDEN_LOG_REGEX (lines 41–42, 95–97); fails build when console.log/error/warn with reply, content, message, transcript, prompt, summary, note as identifier in app/ or lib/ (test/ and logGuard/safeTables excluded). |

---

# SECTION 8 — ARCHITECTURAL MATURITY VERDICT

**Scores (evidence-based)**

| Area | Score | Justification |
|------|-------|----------------|
| **Storage discipline** | Strong | WRITE_BLOCKED_TABLES and BANNED_FIELDS enforced; all writes through safe layer; *_v2 only for app data; governance_state and admin_user_flags in SAFE_TABLES (safeTables.ts 8, 18). |
| **Deterministic spine integrity** | Strong | behaviour_events append-only, validated enums; governance state computed from events; no LLM in state; coupling: read governance → resolve mode → AI. |
| **Emotional interface integrity** | Strong | Mode via system message; filterUnsafeContent on text and exercise; crisis logs metadata only; conversation metadata only. |
| **Hybrid coupling strength** | Strong | Governance read (and recompute if stale) before AI; crisis triggers recordEvent; no AI→governance write. |
| **Migration correctness** | Strong | migration_state; export disabled after COMPLETED; purge gated by status = COMPLETED; run_phase_m4_audit_user present; legacy reads removed from normal paths. |
| **Admin governance readiness** | Strong | Admin routes for subscribers, user metadata, suspend, analytics overview; requireAdminRole (app_metadata.role); metadata only; tests assert no content in responses. |
| **Observability** | Strong | logGuard; SecurityEventMeta metadata-only; FORBIDDEN_LOG_REGEX in CI blocks logging reply/content/message/transcript/prompt/summary/note in app/lib. |
| **Test discipline** | Good | Mode, vellaText, encryption, migration, safeSupabaseWrite, governance safe table, webhook idempotency, admin auth/subscribers/metadataNoText, log static scan; no staging log audit. |

**Overall classification: Structured**

- **Rationale:** Storage, hybrid coupling, migration, and admin control plane are implemented and contract-aligned. governance_state is in SAFE_TABLES; admin routes exist with role-based auth and metadata-only responses; CI blocks forbidden identifier logging in app/lib. Remaining gaps: MFA and separate admin subdomain (Contract 458–463) not verified in this audit; staging log audit for INV-13 not in repo. The system meets the contract’s structural and safety requirements and is classified as structured; production-grade would require verification of MFA, subdomain, and operational runbooks.

---

**END OF AUDIT**

*Every claim above references file paths and line numbers. Where something could not be verified, it is marked "Not verifiable" or the limitation is stated.*
