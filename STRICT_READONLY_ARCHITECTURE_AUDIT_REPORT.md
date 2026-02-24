# STRICT READ-ONLY ARCHITECTURE AUDIT REPORT
**Vella hybrid architecture: Emotional Interface + Deterministic Spine + Storage/Privacy**  
**No code changes. Evidence only. File paths and line references.**

---

## SECTION 1 — Emotional Interface Audit

### 1.1 AI entry points

| Route / location | Purpose | Writes conversation text to Supabase? | Writes metadata only? |
|------------------|---------|---------------------------------------|------------------------|
| `MOBILE/app/api/vella/text/route.ts` | Text chat completion | **No** | **Yes** — `recordConversationMetadataV2({ messageCount, tokenCount, modelId })` only (lines 128–129, 185–190). Uses `SafeDataError` / `serverTextStorageBlockedResponse` on blocked writes (204–206). |
| `MOBILE/app/api/insights/generate/route.ts` | AI insights from check-ins | **No** | Returns JSON; no conversation or message table write. |
| `MOBILE/app/api/insights/patterns/route.ts` | Pattern analysis (OpenAI or lite) | **No** | Returns JSON; no Supabase write of content. |
| `MOBILE/app/api/audio/vella/route.ts` | TTS (OpenAI speech) | **No** | No conversation/metadata write in route. |
| `MOBILE/app/api/voice/speak/route.ts` | TTS | **No** | No conversation write. |
| `MOBILE/app/api/realtime/token/route.ts` | Realtime session token | **No** | No conversation write. |
| `MOBILE/app/api/realtime/offer/route.ts` | Realtime WebRTC offer | **No** | No conversation write. |
| `MOBILE/app/api/transcribe/route.ts` | Whisper transcription | **No** | Returns `{ text, confidence }` in response only; no Supabase write (84–87). |
| `MOBILE/app/api/memory/embed/route.ts` | Embed chunks (service-key) | **N/A** | Writes to `memory_chunks` via `markChunkEmbedded`; `memory_chunks` is in `WRITE_BLOCKED_TABLES` so writes throw and route returns 409 (safeSupabaseWrite.ts 49–55, 169–176; embed route 72–74). |
| `MOBILE/lib/ai/textEngine.ts` | `runVellaTextCompletion` | **No** | Not a route; used by vella/text which only calls `recordConversationMetadataV2`. |
| `MOBILE/lib/ai/agents.ts` | Various agent calls (clarity, strategy, etc.) | **No** | Used by realtime/insights; no direct Supabase conversation write. |
| `MOBILE/lib/memory/summariser.ts` | `summariseMessages` | **No** | Returns string; no Supabase write found; used in realtime flow (strategy/delivery), not for persistence. |

**Conclusion (1.1):** All AI entry points that persist data write **metadata only** (e.g. `conversation_metadata_v2`: message_count, token_count, model_id, mode_enum). No route writes conversation text to Supabase. Legacy content tables are write-blocked.

---

### 1.2 Mode handling

| Requirement | Evidence |
|-------------|----------|
| Explicit mode_enum (vent, listen, challenge, coach, crisis) | **Not implemented.** Only `mode_enum: "text"` appears in app code: `MOBILE/lib/conversation/db.ts` line 71. Types: `MOBILE/lib/supabase/types.ts` 1207, 1217, 1227 — `mode_enum: string \| null`. No vent/listen/challenge/coach/crisis in codebase. |
| Challenge mode gated by governance risk_score | **N/A** — no challenge mode; no code reads `governance_state` or `risk_score` before choosing mode. |
| Crisis mode always available | **N/A** — no crisis mode implemented. |

**Conclusion (1.2):** Mode handling is **PARTIAL**: only a single conversational mode (`text`) is recorded in metadata. No vent/listen/challenge/coach/crisis enum or risk-gating.

---

### 1.3 Safety layer

| Requirement | Evidence |
|-------------|----------|
| `filterUnsafeContent` or similar on AI responses | **Voice path only.** `MOBILE/lib/realtime/useRealtimeVella.ts`: user transcript filtered at 1136 (`filterUnsafeContent(transcript)`), assistant text at 1186 (`filterUnsafeContent(trimmed)`). **Text path:** `MOBILE/app/api/vella/text/route.ts` and `MOBILE/lib/ai/textEngine.ts` do **not** call `filterUnsafeContent` on the model reply. |
| No request/response body logging | **Confirmed.** `MOBILE/lib/security/logGuard.ts`: `SENSITIVE_KEYS` redacts message, content, transcript, reply, prompt, etc. (7–34); `installLogGuard()` overrides console.log/error/warn with redacted args (62–71). `MOBILE/lib/security/observability.ts`: `logSecurityEvent` logs only requestId, route, outcome, latencyMs, userIdHash, ipHash (59–72). No body or content. |
| Safety audit events store metadata only | **Confirmed.** `MOBILE/lib/audit/logger.ts`: payload is `id, user_id, event_type, created_at, route?, outcome?` (16–23). `MOBILE/lib/audit/types.ts`: outcome is “Non-free-text code only”; payload must never contain user/assistant text (2–4, 19–20). |

**Conclusion (1.3):** Safety layer is **PARTIAL**: filter applied on realtime voice input/response; **not** on text API response. Logging and audit are metadata-only.

---

### Section 1 verdict

| Verdict | **PARTIAL** |
|---------|-------------|
| Evidence summary | Emotional interface exists: AI routes, metadata-only conversation writes, no server-side conversation text storage. Gaps: no mode_enum (vent/listen/challenge/coach/crisis), no risk-gating, no crisis mode; `filterUnsafeContent` not applied on text API replies; safety audit and logging are metadata-only. |

---

## SECTION 2 — Deterministic Spine Audit

### 2.1 Governance event model

| Requirement | Evidence |
|-------------|----------|
| Append-only behaviour_events table | **App: append-only.** Only `safeInsert("behaviour_events", ...)` in `MOBILE/lib/governance/events.ts` (99). No `safeUpdate` or `safeUpsert` on behaviour_events in app. Migration `MOBILE/supabase/migrations/20260221_governance_tables.sql` 177–181: RLS allows INSERT and DELETE; comment says “No UPDATE/DELETE for append-only” but DELETE policy exists (181–182). App code does not call delete. |
| No updates/deletes in app code | **Confirmed.** Grep: no `.update(` or `.delete(` on behaviour_events in MOBILE app/lib. |
| No free-text in governance events | **Confirmed.** Row: `event_type`, `occurred_at`, `commitment_id`, `subject_code`, `metadata` (JSONB). Validation: `MOBILE/lib/governance/validation.ts` — `event_type` from `GOVERNANCE_EVENT_TYPES` enum (95); `metadata_code` is `governanceMetadataSchema` (record of number/code string/ISO timestamp only, 33–40). Events.ts builds row with `metadata: (validated.metadata_code ?? {})` (93). Migration: “metadata only”, no content/description (109–116). |
| Enum-based event types | **Confirmed.** `GOVERNANCE_EVENT_TYPES` in validation.ts 46–55; DB type `governance_event_type` in 20260221_governance_tables.sql 9–18. |

---

### 2.2 State engine

| Requirement | Evidence |
|-------------|----------|
| Server-side recompute of governance_state | **Confirmed.** `MOBILE/lib/governance/stateEngine.ts`: `computeGovernanceState(userId)` reads behaviour_events, commitments, abstinence_targets, focus_sessions (50–70); computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level (96–114); upserts `governance_state` (144). Called from `MOBILE/app/api/internal/governance/daily/route.ts` (50). |
| Deterministic (no randomness) | **Confirmed.** stateEngine uses only counts, filters, and fixed formulas (e.g. computeGovernanceRiskScore 192–204, computeEscalationLevel 205–210). No random or LLM. |
| risk_score calculation location | **Confirmed.** `MOBILE/lib/governance/stateEngine.ts` 108–112: `computeGovernanceRiskScore(abstinenceViolations7d, commitmentViolations7d, focus_state, focusSessions.length)`; function at 192–204: score from violations and focus state, capped at 10. |
| governance_state has no free-text | **Confirmed.** state_json: recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level, last_computed_at_iso (115–122). All codes or numbers. safeSupabaseWrite allows `governance_state.state_json` as long string key (65); content is structured codes only. |

**Behavioural state (separate from governance):** `MOBILE/lib/engine/behavioural/recomputeState.ts` recomputes `behavioural_state_current` / `behavioural_state_history` from journal_entries_v2, check_ins_v2, conversation_metadata_v2, user_goals (counts only); no LLM (65–66). Triggered by `MOBILE/app/api/state/recompute/route.ts`.

---

### 2.3 Risk gating integration

| Requirement | Evidence |
|-------------|----------|
| governance_state influences AI mode? | **No.** No reference to `governance_state`, `governance_risk_score`, or `escalation_level` in vella/text route, textEngine, or useRealtimeVella. `getBehaviouralStateForUser` (behavioural_state) is used by progress, connection-index, identity, loops, traits, distortions, themes — not by vella/text or realtime. |
| governance_state influences UI? | **No.** No UI component or hook found that reads governance_state or risk_score. |
| governance_state influences feature access? | **No.** No feature flag or gate found that depends on governance_state. |

**Conclusion (2.3):** Deterministic spine (events + state engine + risk_score) exists and is computed server-side, but is **not connected** to AI mode, UI, or feature access. Only consumed by internal governance daily job.

---

### Section 2 verdict

| Verdict | **PARTIAL** (spine strong, integration cosmetic) |
|---------|-----------------------------------------------|
| Evidence summary | Append-only behaviour_events in app; enum event types; no free-text in events; server-side deterministic governance_state and risk_score. Spine is not wired to AI or UI. |

---

## SECTION 3 — Hybrid Integration Audit

### 3.1 Emotional interface ↔ governance

| Question | Evidence |
|----------|----------|
| Does Emotional Interface read governance_state before responding? | **No.** vella/text and realtime do not call `computeGovernanceState` or read governance_state. |
| Does it change behaviour based on risk_score/escalation? | **No.** No branching on risk_score or escalation_level in AI routes or realtime hook. |
| Does it emit governance events (recordEvent) based on conversation outcomes? | **No.** `recordEvent` is only defined and used inside `MOBILE/lib/governance/events.ts`. No import of `recordEvent` in vella/text, useRealtimeVella, or any AI route. |

### 3.2 Direct AI writes to governance tables

**No.** No AI route or lib/ai code writes to behaviour_events, governance_state, commitments, abstinence_targets, or focus_sessions.

### 3.3 Boundary

| Aspect | Evidence |
|--------|----------|
| AI writes metadata only | **Yes.** conversation_metadata_v2 only (message_count, token_count, model_id, mode_enum). |
| Governance consumes events only | **Yes.** stateEngine reads behaviour_events (and commitments, abstinence_targets, focus_sessions); no read of conversation content. |
| Circular dependency | **No.** AI does not read governance_state; governance does not read AI content. |

**Conclusion:** Boundary is clean but **one-way**: governance does not receive events from the conversational layer, and AI does not read governance state.

---

### Section 3 verdict

| Verdict | **PARTIAL** (boundary clear, integration not implemented) |
|---------|-----------------------------------------------------------|
| Evidence summary | No AI → governance event emission; no governance_state → AI/UI. Hybrid integration is design-clean but not implemented. |

---

## SECTION 4 — Storage & Privacy Compliance

### 4.1 Legacy text and v2 usage

| Requirement | Evidence |
|-------------|----------|
| No legacy text columns written | **Confirmed.** `MOBILE/lib/safe/safeSupabaseWrite.ts`: `WRITE_BLOCKED_TABLES` = journal_entries, conversation_messages, check_ins, memory_chunks, user_reports (49–55). All writes to these throw SafeDataError WRITE_BLOCKED_TABLE. |
| Only *_v2 tables written for user content | **Confirmed.** Conversation: `recordConversationMetadataV2` → conversation_metadata_v2 (lib/conversation/db.ts 76–77). Journals: journal/db.ts uses "journal_entries_v2" (88); checkins: checkins/db.ts uses "check_ins_v2" (98, 132, 149). Reports: reports/create route writes user_reports_v2 with report_type, severity, status only — no summary/notes (40–50). Schema: journal_entries_v2, check_ins_v2, conversation_metadata_v2, user_reports_v2 have no content/title/note/summary columns (MOBILE/supabase/migrations/20260224_content_tables_v2.sql; types 1169–1296). |
| IndexedDB encryption for journals, checkins, conversations, reports | **Confirmed.** `MOBILE/lib/local/db/journalRepo.ts`: encryptField/decryptField for title/content (22–23, 50–51). `MOBILE/lib/local/db/checkinsRepo.ts`: encryptField/decryptField for note (26, 45, 52). `MOBILE/lib/local/db/conversationRepo.ts`: encryptField/decryptField for content (24, 37, 50). `MOBILE/lib/local/db/reportsRepo.ts`: encryptField/decryptField for summary/notes (24–25, 35–36). Encryption: `MOBILE/lib/local/encryption/index.ts`, crypto.ts (AES-GCM, AAD). DB name: vella_local_v2 (lib/local/db/indexedDB.ts 6). |

### 4.2 Export routes

| Requirement | Evidence |
|-------------|----------|
| Gated by migration_state | **Confirmed.** `MOBILE/lib/migration/exportGuard.ts` 42–48: `getMigrationState(userId)`; if `state?.status === "COMPLETED"` return 403 MIGRATION_ALREADY_COMPLETED. |
| Disabled once COMPLETED | **Confirmed.** Journals, checkins, conversations, reports export routes call `guardMigrationExport` then return 410 with `legacy_schema_dropped` (e.g. MOBILE/app/api/migration/export/journals/route.ts 9–15). So export is gated (403 when COMPLETED) and content exports always return 410 (legacy dropped). Memory export (MOBILE/app/api/migration/export/memory/route.ts) uses same guard; response excludes content (select omits content column) — metadata only (25–45). |

---

### Section 4 verdict

| Verdict | **CLEAN** |
|---------|-----------|
| Evidence summary | Legacy text tables write-blocked; only v2 metadata tables written; IndexedDB encryption for journals, checkins, conversations, reports; export gated by migration_state and content exports disabled (410). |

---

## SECTION 5 — Final Architectural Verdict

| Dimension | Score | Notes |
|-----------|--------|--------|
| **Emotional Interface** | **PARTIAL** | AI entry points and metadata-only writes in place; no mode_enum (vent/listen/challenge/coach/crisis), no risk-gating or crisis mode; safety filter on voice but not on text API reply. |
| **Deterministic Spine** | **PARTIAL** | Strong event model and state engine (append-only events, enum types, server-side deterministic risk_score). Not connected to AI or UI. |
| **Hybrid Integration** | **PARTIAL** | Clean boundary (AI metadata only; governance events only). No AI → governance events; no governance_state → AI/UI. |
| **Storage Compliance** | **CLEAN** | No server-side free-text storage post M1–M4; v2 metadata only; local-first encryption for journals, checkins, conversations, reports; export gated and disabled when COMPLETED. |

**Overall architecture maturity:** **Transitional**

- **Prototype:** Would imply no clear separation or no spine. Not applicable: spine and separation exist.
- **Transitional:** Spine and storage model are in place; emotional interface is partially specified (missing modes and risk-gating); integration between interface and spine is not implemented. This matches the evidence.
- **Structured / Contract-aligned / Production-grade:** Would require full mode_enum, risk-gating, crisis handling, and governance_state driving AI/UI.

---

## Evidence table (quick reference)

| Finding | File(s) | Line(s) / detail |
|---------|---------|-------------------|
| vella/text writes metadata only | MOBILE/app/api/vella/text/route.ts | 4, 128–129, 185–190, 204–206 |
| recordConversationMetadataV2 shape | MOBILE/lib/conversation/db.ts | 59–82 |
| conversation_metadata_v2 no content | MOBILE/lib/supabase/types.ts, 20260224_content_tables_v2.sql | 1201–1231, 28–46 |
| filterUnsafeContent (voice only) | MOBILE/lib/realtime/useRealtimeVella.ts | 46, 1136, 1186 |
| filterUnsafeContent not in text route | MOBILE/app/api/vella/text/route.ts, lib/ai/textEngine.ts | — |
| logGuard redaction | MOBILE/lib/security/logGuard.ts | 7–34, 62–71 |
| logSecurityEvent metadata only | MOBILE/lib/security/observability.ts | 59–72 |
| Audit payload metadata only | MOBILE/lib/audit/logger.ts, types.ts | 16–23, 2–4, 19–20 |
| mode_enum only "text" | MOBILE/lib/conversation/db.ts | 71 |
| behaviour_events append-only (app) | MOBILE/lib/governance/events.ts | 52–99, 111–127 |
| behaviour_events no free-text | MOBILE/lib/governance/validation.ts, events.ts | 33–40, 92–96, 87–93 |
| GOVERNANCE_EVENT_TYPES enum | MOBILE/lib/governance/validation.ts | 46–55 |
| computeGovernanceState | MOBILE/lib/governance/stateEngine.ts | 41–156, 192–210 |
| governance_state not read by AI/UI | Grep: no refs in vella/text, useRealtimeVella, UI | — |
| recordEvent not called from AI | Grep: only definition in governance/events.ts | — |
| WRITE_BLOCKED_TABLES | MOBILE/lib/safe/safeSupabaseWrite.ts | 49–55, 169–176 |
| v2 tables written only | MOBILE/lib/conversation/db.ts, journal/db.ts, checkins/db.ts, reports/create/route.ts | 76–77, 88, 98/132/149, 41–50 |
| IndexedDB encryption | MOBILE/lib/local/db/*Repo.ts, encryption/index.ts, crypto.ts | journalRepo 22–23,50–51; checkinsRepo 26,45,52; conversationRepo 24,37,50; reportsRepo 24–25,35–36 |
| Export gated by migration_state | MOBILE/lib/migration/exportGuard.ts | 42–48 |
| Export 410 / disabled | MOBILE/app/api/migration/export/journals|checkins|conversations|reports/route.ts | 9–15 each |
| governance_state state_json codes | MOBILE/lib/governance/stateEngine.ts | 115–122 |
| behaviour_events RLS (INSERT + DELETE) | MOBILE/supabase/migrations/20260221_governance_tables.sql | 177–182 |

---

*End of report. No recommendations; evidence only.*
