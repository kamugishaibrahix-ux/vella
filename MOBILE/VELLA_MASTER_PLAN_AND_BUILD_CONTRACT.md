# VELLA Master Plan & Build Contract

**Version 1.0** | **Production Architecture** | **Confidential**  
**Single Source of Truth for Engineering, Product, Legal, and Operations**

---

## Table of Contents

0. Executive Summary  
1. Non-Negotiables and Invariants  
2. Data Classification Matrix  
3. System Architecture  
4. Domain Models and Source of Truth  
5. Deterministic Governance Spine (Behaviour OS)  
6. AI Layer (Emotional Interface)  
7. API Design  
8. Admin Control Plan  
9. Security and Privacy  
10. Migration Strategy (Legacy to Compliant)  
11. Testing and Release Gates  
12. Roadmap and Phases  
13. Incident Response  
Appendix A: Invariant Checklist (Automation Targets)  
Appendix B: Glossary  

---

## 0. Executive Summary

### What Vella Is

Vella is a consumer mobile application that combines an emotionally intelligent conversational companion with a deterministic behavioural governance system. It exists to serve users who want to be genuinely heard, supported in recovery or discipline, and challenged intellectually — in a single coherent product.

Vella operates as a hybrid system with two distinct, non-overlapping layers:

- **Emotional Interface Layer:** A warm, reflective, LLM-powered conversational companion. Users can vent, process loneliness, explore identity, journal, and receive non-judgmental support. This layer is human-feeling, adaptive, and qualitative.
- **Deterministic Governance Spine (Behaviour OS):** A rule-based, auditable infrastructure that tracks commitments, abstinence recovery (with relapse events), focus execution sessions, discipline outcomes, and escalation states. This layer is deterministic, testable, and never relies on an LLM for factual state decisions.

The two layers communicate via a defined interface: the Governance Spine produces structured state objects that inform how the AI layer presents itself — but the AI never writes to governance state, and governance state never contains free text.

### What Vella Is Not

- Not a medical device, clinical tool, or substitute for professional mental health care
- Not a social network or multi-user real-time platform
- Not a productivity app with calendar sync or third-party integrations in MVP
- Not a data broker — user personal content is never transmitted to or stored on servers
- Not a romantic companion app — romantic roleplay is explicitly prohibited
- Not anonymous — accounts require authentication, but personal content stays on-device

### The Core Privacy Commitment

All user free text — journals, chat, check-in notes, memory, summaries — is stored exclusively on the user's device. Vella's servers store only safe metadata: timestamps, counters, hashes, enum codes, flags, and entitlement records. This is an architectural invariant, not a setting.

### The Critical Problem This Plan Corrects

The legacy implementation stored free text (journal_entries.content, conversation_messages.content, check_ins.note, memory_chunks.content, user_reports.summary) in Supabase. A guard existed but most write paths bypassed it. This plan establishes a correct-by-construction architecture that makes server-side text storage structurally impossible, not merely policy-prohibited.

---

## 1. Non-Negotiables and Invariants

### 1.1 Absolute Data Constraints

These are binary pass/fail invariants. Any system state that violates them is a P0 incident regardless of business justification.

**INV-01: No user free text in server database**

- **Definition:** journal content, chat messages, check-in notes, memory chunks, narrative summaries, prompts, LLM responses, any user-typed text, any AI-generated narrative.
- **Test:** Automated nightly scan of all Supabase tables for TEXT/VARCHAR columns containing content fields. Zero tolerance.
- **Enforcement:** Schema-level — no TEXT columns for content exist in server schema. API layer — payload validator rejects any request containing banned fields.

**INV-02: All sensitive user content stored in device IndexedDB/Dexie**

- **Definition:** All domains listed in Section 4 as local-only.
- **Test:** E2E test verifies that after creating a journal entry, no Supabase row contains text content. Supabase row exists only for metadata (timestamp, hash, id).

**INV-03: Governance state is deterministic and non-LLM**

- **Definition:** All state transitions in commitment tracking, abstinence streaks, focus sessions, escalation states are computed by a rule engine — never by an LLM inference.
- **Test:** Given identical event sequences, governance engine produces identical state. 100% reproducibility required.

**INV-04: AI layer never writes to governance state directly**

- **Definition:** AI outputs are conversational only. User-facing actions (mark session complete, log relapse, record commitment) are triggered by explicit UI controls, not by AI parsing.
- **Test:** Integration test confirms no governance event is created without an explicit user action payload (not AI output).

**INV-05: API rejects banned fields at the boundary**

- **Definition:** Edge function middleware validates every inbound payload and rejects (HTTP 400) any body containing: content, text, message, note, summary, transcript, journal, response, prompt, narrative, or any field resolving to a string exceeding 500 characters that is not on the explicit allowlist.
- **Test:** Fuzzing suite tests 200+ variations of field names and encodings. Zero bypass in CI.

**INV-06: No AI request or response body in any server log**

- **Definition:** No AI request body (user message, mode, governance_context payload) or AI response body (assistant message, reasoning) may appear in any server log, observability system, or error message. Only token counts, latency, model, mode, success/fail, and non-content metadata are permitted.
- **Test:** Automated log inspection in staging: run AI flows, capture logs, assert zero occurrence of request/response body content. This test is part of the invariant checklist (Appendix A, INV-13).

### 1.2 Security Non-Negotiables

- All API calls use HTTPS with TLS 1.2+ minimum (TLS 1.3 preferred)
- All Supabase access via Row-Level Security (RLS) policies. No service role key in client apps
- JWT tokens expire in 1 hour; refresh tokens expire in 30 days
- Admin panel requires MFA; admin roles enforced at RLS level, not just UI
- No secrets in client bundle. All AI API keys server-side only
- Rate limiting enforced at edge before any business logic

### 1.3 UX Non-Negotiables

- Governance feedback to users is always framed supportively, never punitively
- Relapse flow never uses shame language; never displays streak counter loss prominently on relapse
- Users can delete all their data (local + server metadata) at any time in-app
- App is usable offline for all local-first features; sync is incremental on reconnect
- Age gate: minimum age 16 globally, 18 in jurisdictions requiring it (lawyer review required)

### 1.4 Do Not Build List (MVP)

- Social features, user-to-user messaging
- Calendar or third-party app integration
- Voice input or voice synthesis
- Biometric or wearable data ingestion
- Group accountability or cohort features
- Romantic or sexual companion persona
- Medical symptom tracking or clinical assessments
- Push notifications containing user content
- Server-side AI memory or profile (all memory is local-only)
- Cross-device sync in MVP (deferred to Phase 2 with E2E encryption)

### 1.5 Forbidden Data List

The following data types must NEVER appear in any Supabase table, edge function log, analytics pipeline, or third-party service:

| Forbidden Data Type | Examples | Rationale |
|---------------------|----------|-----------|
| Journal text content | Entry body, drafts, daily reflections | Sensitive personal narrative |
| Chat/conversation content | User messages, AI responses, transcripts | Emotional/therapeutic content |
| Check-in notes | Mood descriptions, context annotations | Personal health data |
| Memory chunk text | Recalled facts, personal statements | Identity/personal data |
| Report summaries | AI-generated narrative summaries | Derived personal content |
| Prompts sent to AI | System prompts with user context | May contain personal details |
| Governance event free text | Any description field > enum code | Must remain metadata-only |
| Device identifiers | IDFA, Android Advertising ID | Privacy regulation risk |
| Location beyond country/timezone | GPS, IP geolocation to city | Not required; minimise collection |

---

## 2. Data Classification Matrix

### 2.1 Local-Only Data (Device Storage, Never Leaves Device)

| Domain | Data Types | Storage | Encryption |
|--------|------------|---------|------------|
| Journals | Entry text, title, mood tags, date | IndexedDB/Dexie | AES-256-GCM (user key) |
| Conversations | Full message history, AI responses, session context | IndexedDB/Dexie | AES-256-GCM |
| Check-ins | Note text, mood score context, annotations | IndexedDB/Dexie | AES-256-GCM |
| Memory Chunks | Extracted facts, personal statements, context | IndexedDB/Dexie | AES-256-GCM |
| Goal descriptions | Free-text goal narratives, personal context | IndexedDB/Dexie | AES-256-GCM |
| AI-generated summaries | Any narrative output from AI layer | IndexedDB/Dexie | AES-256-GCM |
| Focus session notes | Pre/post session reflections | IndexedDB/Dexie | AES-256-GCM |
| Abstinence context | Personal recovery narrative, triggers (text) | IndexedDB/Dexie | AES-256-GCM |

### 2.2 Server Metadata (Supabase, Safe to Store)

| Domain | Allowed Fields | Forbidden Fields |
|--------|----------------|-------------------|
| Users | user_id, created_at, plan_tier, entitlements, timezone_offset, country_code | Name, email beyond auth, preferences text |
| Journal metadata | journal_id, user_id, created_at, word_count, mood_score (int), local_hash | content, title, tags |
| Conversation metadata | convo_id, user_id, started_at, ended_at, message_count, mode_enum | messages, transcript, any text |
| Check-in metadata | checkin_id, user_id, timestamp, mood_score (1-10), type_enum | note, annotation, description |
| Governance events | event_id, user_id, event_type_enum, timestamp, severity_int, entity_id | description, reason, notes |
| Governance state | state_id, user_id, domain_enum, state_code, updated_at, numeric values | Any narrative or text fields |
| Commitments | commitment_id, user_id, cadence_enum, start_date, end_date, status_enum | description, name text |
| Abstinence tracking | record_id, user_id, target_type_enum, start_ts, relapse_ts, streak_days | substance name, personal context |
| Focus sessions | session_id, user_id, started_at, ended_at, duration_mins, completed_bool | task description, notes |
| Subscriptions | sub_id, user_id, plan_enum, status_enum, period_end, quota_remaining | payment details (Stripe-only) |
| Audit log | log_id, user_id, action_enum, timestamp, ip_hash, success_bool | request bodies, response bodies |
| Rate limit state | user_id, window_start, request_count, endpoint_enum | Any content |

### 2.3 Derived Aggregate Analytics (Non-Identifying)

These may be computed server-side or in analytics pipelines and used for product decisions. No individual user must be identifiable.

- Daily active users by plan tier (count only)
- Median session length by feature (focus, conversation, journal)
- Commitment completion rates by cadence type (anonymous aggregate)
- Relapse event frequency by abstinence target type (no user linkage)
- AI API token consumption by mode (aggregate, not per-user in analytics layer)
- Error rates by endpoint (no payload content)
- Onboarding funnel completion rates (step enum, not user ID in analytics)

Source of truth for aggregate analytics: a dedicated analytics schema with user_id replaced by a rotating cohort_id. Raw event tables with user_id must never be exposed to analytics queries that return per-user data.

---

## 3. System Architecture

### 3.1 Architecture Overview

Vella is a local-first mobile application with a thin metadata-only cloud backend. The architecture enforces the privacy boundary structurally:

- **Device:** All personal content, full application state, offline capability
- **Edge Functions (Supabase):** Authentication, quota enforcement, metadata CRUD, governance event relay
- **AI API Gateway:** Claude/OpenAI API proxy with key management and rate limiting; never stores prompts/responses
- **Admin Panel:** Separate web application with its own auth; reads only server metadata

### 3.2 Frontend Architecture

#### 3.2.1 Technology Stack

- **Framework:** React Native (Expo managed workflow) for iOS and Android
- **Local storage:** Dexie.js (IndexedDB wrapper) with a migration system
- **State management:** Zustand for UI state; Dexie reactive queries for data state
- **Local encryption:** WebCrypto AES-256-GCM with key derived from user passphrase + device key
- **Offline-first:** All writes go to Dexie first; metadata sync queue flushes to server when online
- **Navigation:** React Navigation v6 (stack + tab)

#### 3.2.2 Local Storage Schema (Dexie)

These tables exist only on-device. Schema version controlled via Dexie migrations.

| Table | Key Fields | Encrypted | Synced to Server |
|-------|------------|-----------|------------------|
| journals | id, created_at, mood_score, word_count, content (encrypted) | Yes | Metadata only (hash, word_count, mood_score) |
| conversations | id, started_at, mode, messages (encrypted JSON array) | Yes | Metadata only (counts, duration) |
| check_ins | id, timestamp, mood_score, note (encrypted) | Yes | mood_score, timestamp only |
| memory_chunks | id, created_at, category_enum, text (encrypted) | Yes | Never |
| goals | id, created_at, status_enum, description (encrypted) | Yes | Metadata only |
| governance_events | id, timestamp, type_enum, entity_id, payload_json, engine_version | No (metadata only) | Yes (full row, no text) |
| governance_state | domain_enum, state_code, updated_at, numeric_values_json, engine_version | No (metadata) | Yes (full row) |
| focus_sessions | id, started_at, ended_at, duration_mins, task_note (encrypted) | Partial | Metadata only |
| abstinence_records | id, target_type_enum, start_ts, streak_days, relapse_events_json | No for enums | Metadata only |
| sync_queue | id, table_name, record_id, operation, created_at | No | Processed then deleted |

#### 3.2.3 Encryption Strategy

- **Key Derivation:** On first app launch, generate a 256-bit device key using WebCrypto and store in SecureStore (Expo). If user sets a passphrase, derive a wrapping key via PBKDF2 (iterations: 310,000, SHA-256) and encrypt the device key with it.
- **Encryption per record:** AES-256-GCM with a unique 96-bit IV per record. Authenticated with the record's id as additional data. Ciphertext stored as base64 in the content field.
- **Key rotation:** Supported in Phase 2. Requires re-encryption of all local records. Key version tracked per record.

Cross-device sync is NOT supported in MVP. If a user installs on a second device, they start fresh. Phase 2 will implement E2E-encrypted sync via encrypted export/import bundle. The key NEVER leaves the device unencrypted.

#### 3.2.4 Sync Strategy

Only governance_events, governance_state, and safe metadata rows are synced. The sync process:

1. Write to local Dexie table
2. Append to sync_queue (table, record_id, operation)
3. Background sync worker flushes queue when network available
4. For each item: POST metadata-only payload to edge function
5. Edge function validates payload (no banned fields), writes to Supabase
6. On success: remove item from sync_queue
7. On conflict: last-write-wins for metadata; local always wins for content

### 3.3 Backend Architecture

#### 3.3.1 Supabase Configuration

- **Project:** One production, one staging, one development Supabase project
- **Auth:** Supabase Auth (email/password + optional OAuth). JWT RS256
- **Database:** PostgreSQL 15. All tables have RLS enabled. No anonymous access
- **Edge Functions:** Deno/TypeScript. All business logic here, not in client
- **Storage:** Not used for user data. Only used for static assets (e.g., avatar placeholder)
- **Realtime:** Disabled for all tables containing metadata. Not needed in MVP

#### 3.3.2 Edge Function Inventory

| Function | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| /auth/session | POST | Exchange code for JWT, refresh token | No |
| /user/onboard | POST | Create user record, set initial entitlements | Yes |
| /user/delete | DELETE | Delete all server metadata for user | Yes (own) |
| /metadata/journal | POST | Sync journal metadata (hash, word_count, mood_score) | Yes |
| /metadata/checkin | POST | Sync check-in metadata (mood_score, timestamp) | Yes |
| /metadata/conversation | POST | Sync conversation metadata (counts, duration) | Yes |
| /governance/event | POST | Record governance event (enum + numeric payload) | Yes |
| /governance/state | PUT | Update governance state (codes + numbers) | Yes |
| /governance/state | GET | Fetch governance state (for new device restore) | Yes |
| /ai/chat | POST | Proxy chat request to AI API; no storage | Yes |
| /quota/check | GET | Check remaining AI quota for user | Yes |
| /subscription/status | GET | Return plan tier and entitlements | Yes |
| /admin/users | GET | List subscribers with metadata (admin only) | Yes (admin) |
| /admin/analytics | GET | Aggregate governance analytics (admin only) | Yes (admin) |
| /admin/user/:id/quota | PUT | Adjust user quota (admin only) | Yes (admin) |
| /admin/user/:id/suspend | PUT | Suspend account (admin only) | Yes (admin) |
| /health | GET | System health check (public) | No |

#### 3.3.3 Payload Validation Middleware

All edge functions run through a validation middleware BEFORE any business logic:

1. Extract JWT, verify signature, check expiry
2. Parse JSON body
3. Run banned-field scan: reject if any key matches BANNED_FIELDS set or any string value exceeds MAX_STRING_LENGTH (500 chars) and is not on explicit allowlist
4. Run schema validation against function-specific Zod schema
5. Check rate limit (see Section 9)
6. Log sanitised request metadata (no body content)

**BANNED_FIELDS** = { content, text, message, note, summary, transcript, journal, response, prompt, narrative, description, body, comment, reflection, entry, reply, answer, reasoning }

**ENFORCEMENT:** This middleware is not optional. It cannot be bypassed by any feature flag or environment variable in production. The CI pipeline includes a test that verifies every edge function import includes the validation middleware.

### 3.4 AI API Gateway

The AI layer is accessed exclusively via the /ai/chat edge function. This function:

- **Accepts:** mode_enum (vent, listen, challenge, coach), governance_context_json (state codes + numeric values, no text), conversation_turn_count (int)
- **Constructs** system prompt server-side from template + governance_context (no user text in system prompt)
- **Forwards** user message directly to AI API without logging the message
- **Returns** AI response to client without logging the response
- **Records only:** timestamp, token_count, model_id, mode_enum, success_bool to usage table
- **Enforces** per-user token quota before calling AI API

**CRITICAL:** The edge function that proxies AI requests must NOT log request bodies or response bodies in any observability system. Only token counts, latency, model, mode, and success/fail.

**Logging enforcement rules (all edge functions):**

- All edge functions must use a centralised logger wrapper. No ad-hoc logging of request or response data.
- The logger wrapper must explicitly redact body fields. No `logger.log()` (or equivalent) may accept or serialise request/response body content.
- `console.log` (and equivalent) is prohibited in production builds for any path that could receive user or AI content. Build step must strip or gate console in production.
- **CI static rule:** Fail the build if `console.log(req.body)`, `console.log(request.body)`, or equivalent is detected in edge function or API route code.
- **Runtime guard:** If a request body contains any BANNED_FIELDS key and the code path attempts to log that body (e.g. via the centralised logger with a non-redacted payload), the logger must throw an error and the request must be rejected (HTTP 500) with no body content in the error response.
- **Production logging level:** Must be INFO or WARN only. DEBUG level is disabled in production. No request/response bodies at any level.

**Third-party AI provider log risk mitigation:**

- The AI provider (e.g. Claude/OpenAI) must have a Data Processing Agreement (DPA) signed before production use.
- Training data usage must be opt-out (or prohibited by contract). User and assistant messages must not be used for model training.
- Confirm the provider’s logs retention policy in writing. Ensure it aligns with Vella’s privacy policy and that no user or assistant content is retained longer than necessary for the request (e.g. transient only).

---

## 4. Domain Models and Source of Truth

### 4.1 Journals

- **Source of truth:** LOCAL (Dexie)
- **Local schema:** id (uuid), user_id, created_at, updated_at, mood_score (1-10 int), word_count (int), content (encrypted text), tags_json (encrypted), local_hash (SHA-256 of content+timestamp)
- **Server metadata:** journal_id, user_id, created_at, mood_score, word_count, local_hash, is_deleted
- **Sync:** On create/update, push metadata row to server. On delete, set is_deleted=true server-side, purge local
- **Invariant:** server never holds content or tags

### 4.2 Check-Ins

- **Source of truth:** LOCAL (Dexie)
- **Local schema:** id, user_id, timestamp, type_enum (daily|event|crisis), mood_score (1-10), energy_score (1-10), note (encrypted), trigger_enum
- **Server metadata:** checkin_id, user_id, timestamp, type_enum, mood_score, energy_score, trigger_enum
- **Sync:** mood_score, energy_score, type_enum, trigger_enum only

### 4.3 Conversations

- **Source of truth:** LOCAL (Dexie)
- **Local schema:** id, user_id, started_at, ended_at, mode_enum, messages (encrypted JSON array of {role, content, timestamp}), token_count, governance_context_snapshot (encrypted)
- **Server metadata:** convo_id, user_id, started_at, ended_at, mode_enum, message_count, token_count, ai_model_id
- **Sync:** counts and mode only. No message content ever leaves device

### 4.4 Memory Chunks

- **Source of truth:** LOCAL (Dexie), NEVER synced
- **Local schema:** id, user_id, created_at, category_enum (identity|preference|event|goal|recovery), text (encrypted), source_convo_id, confidence_score
- **Server:** no table exists for memory chunks
- **Memory** is extracted client-side from conversation by a local lightweight classifier, then stored encrypted locally

### 4.5 Goals

- **Source of truth:** LOCAL for description; SERVER for metadata
- **Local schema:** id, user_id, created_at, status_enum, description (encrypted), linked_commitment_id
- **Server metadata:** goal_id, user_id, created_at, status_enum, linked_commitment_id

### 4.6 Commitments

- **Source of truth:** SERVER (metadata) + LOCAL (description)
- **Server schema:** commitment_id, user_id, created_at, cadence_enum (daily|weekly|custom), target_days_per_week, start_date, end_date, status_enum (active|paused|completed|failed), outcome_count, miss_count
- **Local:** description text (encrypted), personal notes
- **Commitment title** stored as hash + local plaintext. Hash used for deduplication checks only

### 4.7 Abstinence Tracking

- **Source of truth:** SERVER (state) + LOCAL (context)
- **Server schema:** record_id, user_id, target_type_enum, start_ts, current_streak_days, longest_streak_days, relapse_count, last_relapse_ts, status_enum
- **Local:** target description (encrypted), personal motivation text, trigger log (encrypted)
- **Relapse event:** logged as governance_event with type=RELAPSE, entity_id=record_id, severity_int=3. No text

### 4.8 Focus Sessions

- **Source of truth:** SERVER (metadata) + LOCAL (notes)
- **Server schema:** session_id, user_id, started_at, ended_at, duration_mins, planned_duration_mins, completed_bool, interrupted_bool, mode_enum
- **Local:** task_note (encrypted), pre_session_intent (encrypted), post_session_reflection (encrypted)

### 4.9 Governance Events

- **Source of truth:** SERVER (append-only log)
- **Schema:** event_id (uuid), user_id, event_type_enum, entity_id, entity_type_enum, timestamp, severity_int (1-5), numeric_payload_json ({duration_mins, streak_days, count, etc.}), client_version, **engine_version** (version of governance engine that produced/accepts this event)
- **Immutable** once written. No UPDATE or DELETE in application logic. Soft-delete via is_voided flag with admin audit

governance_events is the audit spine of the system. It must be append-only from application code. Any retrospective correction requires an admin action with audit trail.

### 4.10 Governance State

- **Source of truth:** SERVER (current state snapshot, derived from events)
- **Schema:** state_id, user_id, domain_enum, state_code (varchar 50, enum values only), escalation_level_int, updated_at, streak_days, consecutive_misses, risk_score_int, **engine_version** (version of governance engine that produced this snapshot)
- **Governance state** is recomputed from event log on demand. Server holds the current snapshot for performance

### 4.11 Subscriptions and Quotas

- **Source of truth:** SERVER
- **Schema:** sub_id, user_id, plan_enum (free|pro|premium), status_enum, period_start, period_end, ai_tokens_remaining, ai_tokens_quota, convo_count_today, checkin_count_today
- **Quota** enforced at edge function before AI call

### 4.12 Audit Logs

- **Source of truth:** SERVER (append-only)
- **Schema:** log_id, user_id (nullable), action_enum, timestamp, ip_hash (SHA-256 of IP), user_agent_hash, success_bool, error_code
- **Content** of requests NEVER logged. Only action type and outcome

---

## 5. Deterministic Governance Spine (Behaviour OS)

### 5.1 Design Principles

The Governance Spine is entirely deterministic: same inputs always produce same outputs. It uses no LLM. It is implemented as a pure TypeScript module with zero side effects, runnable in both client and edge function contexts for verification.

- Append-only event log as the source of truth
- State is always a function of the event log: State = f(events)
- No mutable shared state in the computation engine
- All thresholds are configurable constants, not magic numbers
- All state transitions are enumerated and documented

### 5.2 Event Model

#### 5.2.1 Event Types Enum

| Event Type | Domain | Severity | Key Numeric Payload |
|------------|--------|----------|---------------------|
| COMMITMENT_COMPLETED | Commitment | 1 | commitment_id, cadence_day_int |
| COMMITMENT_MISSED | Commitment | 2 | commitment_id, cadence_day_int, consecutive_misses |
| COMMITMENT_PAUSED | Commitment | 1 | commitment_id, reason_enum |
| ABSTINENCE_STARTED | Abstinence | 1 | record_id, target_type_enum |
| RELAPSE_LOGGED | Abstinence | 3 | record_id, streak_broken_days, relapse_count |
| STREAK_MILESTONE | Abstinence | 1 | record_id, milestone_days |
| FOCUS_SESSION_STARTED | Focus | 1 | session_id, planned_duration_mins |
| FOCUS_SESSION_COMPLETED | Focus | 1 | session_id, actual_duration_mins, completion_pct |
| FOCUS_SESSION_ABANDONED | Focus | 2 | session_id, duration_mins, reason_enum |
| CHECKIN_COMPLETED | Engagement | 1 | checkin_id, mood_score |
| CHECKIN_MISSED | Engagement | 2 | days_since_last_int |
| ESCALATION_TRIGGERED | Governance | 4 | domain_enum, escalation_level, trigger_event_id |
| ESCALATION_RESOLVED | Governance | 1 | domain_enum, escalation_level_resolved |
| GOVERNANCE_RESET | Admin | 1 | domain_enum, reset_by_enum |

### 5.3 Commitment Engine

The commitment engine tracks whether a user is meeting their stated commitments (e.g., exercise 3x per week, meditate daily).

#### 5.3.1 Cadence Logic

- **daily:** Expected 1 completion per calendar day. Miss = no COMMITMENT_COMPLETED event in the day window (00:00-23:59 user timezone)
- **weekly:** Expected N completions per Mon-Sun week. Miss = week closes with count < target
- **custom:** user-defined target days. Evaluated at end of each period

#### 5.3.2 Miss Detection

- A background job runs at midnight UTC (configurable per timezone offset)
- For each active commitment, check event log for completions in the closing period
- If count < target: emit COMMITMENT_MISSED event with consecutive_misses incremented
- consecutive_misses resets to 0 on any COMMITMENT_COMPLETED
- Miss detection is idempotent: running twice for the same period produces the same result

#### 5.3.3 Commitment State Machine

| From State | Event | To State | Side Effect |
|------------|-------|----------|-------------|
| active | COMMITMENT_COMPLETED (target met) | active | Increment outcome_count, reset consecutive_misses |
| active | COMMITMENT_MISSED (misses < threshold) | active | Increment miss_count, increment consecutive_misses |
| active | COMMITMENT_MISSED (misses >= 3) | at_risk | Emit ESCALATION_TRIGGERED (level 1) |
| at_risk | COMMITMENT_COMPLETED | active | Emit ESCALATION_RESOLVED |
| at_risk | COMMITMENT_MISSED (misses >= 5) | failing | Emit ESCALATION_TRIGGERED (level 2) |
| failing | COMMITMENT_COMPLETED | at_risk | Partial recovery, escalation level down |
| active\|at_risk\|failing | COMMITMENT_PAUSED (user action) | paused | No miss detection during pause |
| paused | User resumes | active | Reset period, keep historical counts |
| any | Period end + user request | completed | Final state, immutable |

### 5.4 Abstinence Engine

Tracks abstinence from user-defined targets (substances, behaviours) with streak counting and relapse event handling.

#### 5.4.1 Streak Calculation

- streak_days = floor((current_timestamp - start_ts) / 86400) with no relapse events in that period
- On RELAPSE_LOGGED: streak_days frozen as streak_broken_days, new period starts (new start_ts = relapse_ts)
- longest_streak_days = max(all completed streak periods) maintained in server state
- Milestones: emitted at 1, 3, 7, 14, 30, 60, 90, 180, 365 days (configurable)

#### 5.4.2 Relapse Flow (Non-Graphic, Supportive)

The relapse UX flow is a P0 sensitivity requirement. Exact UX defined in Section 6.

- RELAPSE_LOGGED event is emitted by explicit user action only (never inferred by AI)
- Event payload contains numeric data only: streak_broken_days, relapse_count, timestamp
- No text is stored in the event. Personal context goes to encrypted local record
- After logging, governance state transitions to recovery_start
- AI layer is informed via governance_context state code = RECOVERY_ACTIVE, not text

### 5.5 Focus Execution Engine

- **Session lifecycle:** IDLE → RUNNING → COMPLETED | ABANDONED
- **Minimum session length** to count as completed: 5 minutes (configurable)
- completion_pct = actual_duration / planned_duration * 100
- Sessions < 50% completion_pct emit FOCUS_SESSION_ABANDONED
- **Daily focus score** = sum(completed session minutes) for the day
- **Weekly focus trend** = 7-day rolling average of daily focus scores

### 5.6 Risk Aggregation

A deterministic risk score (0-100) is computed from the event log to inform AI coaching tone.

| Signal | Weight | Recency Window | Contribution Logic |
|--------|--------|----------------|---------------------|
| consecutive_misses | High | 7 days | +15 per miss, capped at 60 |
| relapse_events | High | 30 days | +25 per relapse in window, capped at 50 |
| low_mood_checkins | Medium | 7 days | +10 if avg mood_score < 4 |
| focus_abandonment_rate | Medium | 7 days | +10 if abandonment > 50% |
| checkin_missed_days | Low | 7 days | +5 per missed day |
| escalation_level_active | High | Current | +20 if escalation_level >= 2 |

risk_score is stored as an integer in governance_state. It is used by the AI layer to modulate response tone (higher risk = more grounding, less challenging). It is never displayed raw to users.

### 5.7 Governance Authority and Execution Model

- **Server is the authoritative source of truth for governance state.** All persisted governance state is computed and stored server-side. Client-held state is a cache for display only.
- **Client may run the governance engine only for predictive UI display** (e.g. preview of streak or risk after a hypothetical action). Client-computed state has no authority over persisted state.
- **Server recomputes state from the append-only event log on every write.** On each governance event write, the server runs the canonical governance engine over the event log and overwrites the governance_state snapshot. No read-modify-write; state is always f(events).
- **If client-computed state differs from server state, server overwrites.** On sync or any server interaction, server state wins. Client must replace its local governance state with server response.
- **Governance engine version must be versioned.** An `engine_version` field (e.g. semver or build id) identifies the exact rule set used to compute state. This enables deterministic equivalence testing and safe upgrades.
- **Schema requirement:** Add `engine_version` to governance_events (per event) and to governance_state (per snapshot). Every event and every state row must carry the engine_version that produced it.
- **Invariant: Server-side recomputation must be idempotent and canonical.** For a given event log and engine_version, the server must always produce the same state. Running recomputation multiple times for the same inputs must yield identical output.
- **CI requirement:** Client and server governance engines must pass a deterministic equivalence test for the same engine_version: given the same event sequence and version, both engines produce identical state output. This test runs in CI on every change to governance engine code.

---

## 6. AI Layer (Emotional Interface)

### 6.1 Design Philosophy

The AI layer is Vella's face. It must be warm, curious, non-judgmental, and genuine. It must never feel like a therapy chatbot reading from a script. It operates within strict boundaries: it cannot modify governance state, it cannot store anything server-side, and it cannot engage in prohibited content.

The AI layer receives governance context (structured codes and numbers) and uses them to choose tone, not content. The user's personal narrative exists only in local conversation history, which the client sends to the edge function as part of the chat turn (in transit, not persisted).

### 6.2 Conversation Modes

| Mode | User Intent | AI Posture | Governance Context Usage |
|------|--------------|------------|---------------------------|
| Vent Mode | Release, be heard, process emotion | Warm, reflective, validating. Minimal advice. High listening ratio. | If risk_score > 60: gently ground. Avoid challenging. |
| Listen Mode | Slow reflective exploration | Curious, Socratic, gentle. Mirror and expand. | Use mood_score trends to acknowledge recent difficulty. |
| Challenge Mode | Intellectual sparring, growth | Direct, rigorous, playful. Push back constructively. | Only available if risk_score < 40 (configurable). Governance restricts access. |
| Coach Mode | Accountability, commitment support | Supportive but honest. Reference commitments/streaks via governance state. | Uses commitment_status, streak_days, escalation_level directly. |
| Crisis Mode | Distress, safety concern | Calm, grounding, resource-directed. Minimal AI opinions. | Triggered by AI safety classifier or user-initiated. Always available. |

### 6.3 Allowed Inputs to AI Endpoint

- **messages:** array of {role: user|assistant, content: string} — sent in-transit, not persisted server-side
- **mode_enum:** one of the 5 modes above
- **governance_context:** { state_code, escalation_level, streak_days, consecutive_misses, risk_score, mood_score_recent_avg, active_domains_json } — all numeric/enum, no text
- **turn_count:** integer (conversation length for context management)

### 6.4 Prohibited AI Behaviours

These are absolute prohibitions. Any AI output containing these must trigger a safety flag and be blocked before reaching the client.

- Romantic or sexual roleplay or content
- Diagnosing mental health conditions
- Recommending specific medications or medical interventions
- Detailed instructions for self-harm methods
- Encouraging isolation, withdrawal from relationships or professional help
- Making governance state decisions (telling the user their streak is broken, recording relapses)
- Impersonating a real therapist, doctor, or licensed professional
- Storing, repeating, or referencing user free text from previous sessions (only within the current context window)

### 6.5 System Prompt Architecture

System prompts are assembled server-side in the edge function. They are never stored. They are composed from:

1. Static persona template (defines Vella's character, tone principles, prohibitions)
2. Mode-specific instruction block (injected based on mode_enum)
3. Governance context block (structured state, e.g., 'User has a 14-day streak in domain EXERCISE. Current risk score is 22. Escalation: none.')
4. Safety instructions (always appended, cannot be removed by mode override)

The governance context block uses ONLY numeric values and enum codes from the governance_context payload. No user text is ever injected into the system prompt.

### 6.6 Safety Classifier

A lightweight safety classifier runs on every AI response before it is returned to the client. It checks for:

- Self-harm ideation signals (wordlist + pattern matching)
- Crisis language indicators
- Prohibited content patterns (romantic escalation, medical diagnosis language)

On trigger: replace response with a safe template + crisis resource signpost. Log safety_trigger event (type enum only, no content) to server.

**Crisis resource to always include:** 'If you're in crisis, please reach out to a crisis line: 988 (US), 116 123 (UK Samaritans), or your local emergency services.'

### 6.7 UX Requirements for Emotional Interface

*(Sections 6.7.1–6.7.7 summarised; full UX requirements for Venting, Listening, Challenge, Coaching, Focus, Commitments/Abstinence, Relapse Flow, Loneliness Support are as specified in the original plan.)*

- **Venting Mode UX:** Prominent entry, full-screen, warm palette, no advice until user signals.
- **Listening Mode UX:** Socratic questions, optional "save to memory" (local).
- **Challenge Mode UX:** Gated by risk_score < 40; respectful disagreement enforced.
- **Governance-Informed Coaching UX:** Summary card (streak, commitment, mood); supportive framing.
- **Focus Session UX:** Timer, minimal UI, "I need to stop" always visible; reflection local-only.
- **Commitments and Abstinence UX:** Single-tap completion, streak display, gentle miss notification.
- **Relapse Flow UX (P0):** "Log a difficult moment"; validation first; no shame language; streak update quiet.
- **Loneliness Support UX:** Listen mode + gentle connection prompts; no guilt.

---

## 7. API Design

### 7.1 Authentication and Authorization

- **AuthN:** Supabase Auth. All client requests include Authorization: Bearer <JWT>
- **JWT** RS256, 1-hour expiry, refresh via Supabase client library
- **RLS:** Every Supabase table has a row-level security policy: user_id = auth.uid()
- **Admin role:** custom JWT claim admin: true, set server-side. RLS policies check this claim
- **Service role key:** NEVER in client bundle. Only in edge function environment

### 7.2 Rate Limiting Policy

| Endpoint | Limit | Window | On Exceed |
|----------|-------|--------|-----------|
| /ai/chat | 30 requests | 1 hour | HTTP 429, retry_after header |
| /governance/event | 100 requests | 1 hour | HTTP 429 |
| /metadata/* | 200 requests | 1 hour | HTTP 429 |
| /auth/* | 10 requests | 15 minutes | HTTP 429, exponential backoff |
| /admin/* | 500 requests | 1 hour | HTTP 429 (admin-level limits) |
| All endpoints | 1000 requests | 24 hours (per user) | Account flagged for review |

Rate limit state stored in Supabase rate_limits table. IP-based limiting at CDN/proxy level before edge functions. Supabase built-in rate limiting for auth endpoints.

### 7.3 Payload Constraints

| Constraint | Rule | Enforcement |
|------------|------|--------------|
| Max payload size | 16KB for all non-AI endpoints | Middleware rejects with HTTP 413 |
| Max string field length | 500 chars (non-allowlisted) | Middleware rejects with HTTP 400 |
| Allowed string fields | Explicit allowlist per endpoint | Zod schema validation |
| Numeric fields | Must be integers or bounded floats | Zod schema validation |
| Timestamp fields | ISO 8601, within 48hr of server time | Middleware validates range |
| Enum fields | Must match defined enum set | Zod enum validation |
| Array fields | Max 100 items, typed elements only | Zod array with max |
| Nested objects | Max depth 3 | Middleware depth check |

### 7.4 Error Response Standards

All error responses use the format: `{ error: { code: string, message: string, request_id: string } }`. No stack traces or internal details in production. Error codes are machine-readable enums (e.g., RATE_LIMIT_EXCEEDED, BANNED_FIELD_DETECTED, QUOTA_EXHAUSTED).

---

## 8. Admin Control Plan

### 8.1 Admin Roles and Permissions

| Role | Permissions | MFA Required |
|------|-------------|--------------|
| super_admin | All actions including role management, system config, audit log access | Yes (hardware key preferred) |
| ops_admin | User management (suspend/unsuspend), quota adjustment, incident response | Yes |
| support_agent | View subscriber metadata, plan details, usage counts. Cannot view user content. | Yes |
| analyst | Aggregate analytics only. No individual user data. | Yes |
| read_only | System health dashboards, error rates, uptime metrics | Yes |

### 8.2 Admin Panel Information Architecture

- **Dashboard (Home):** Active subscribers by plan, DAU/WAU/MAU, AI usage, error rates, incidents, sign-ups.
- **Subscribers Page:** user_id (truncated), created_at, plan_tier, status, last_active_at, counts; filters and actions (View, Adjust quota, Suspend, Delete). No journal/chat/check-in/memory content.
- **User Detail Page (Support Safe):** Plan, usage, governance summary (numbers only), subscription history, flags, actions. NOT visible: any journal, chat, check-in, or memory content.
- **Analytics Page:** Aggregate only (commitment completion rate, relapse frequency, focus completion, mood distribution, feature adoption). No drill-down to individuals for analyst role.
- **System Health Page:** Error rates, DB pool, AI latency, rate limit triggers, sync queue depth, security events.
- **Audit Log Page (super_admin only):** Action type, timestamp, user_id (truncated), ip_hash, success/fail. No content. Export as CSV (metadata only) with audit trail.
- **Incident Management Page:** Open incidents, severity, type, assignee; linked to system health.

### 8.3 Admin Panel Technical Implementation

- **Framework:** Next.js 14 (App Router) deployed on Vercel
- **Auth:** Supabase Auth with admin JWT claim check on every page load
- **MFA:** Enforced at Supabase Auth level; no admin access without TOTP or hardware key
- **Data:** All admin data from server metadata only. No local storage access
- **Deployment:** Separate subdomain (admin.vella.app), not bundled with user app

---

## 9. Security and Privacy

### 9.1 Threat Model (STRIDE)

- **Spoofing:** Short JWT expiry, device-bound refresh, anomalous login detection. Admin: MFA, session timeout 4h.
- **Tampering:** Edge validates governance payloads; server is source of truth. Banned-field validation; no content columns on server.
- **Repudiation:** Audit log with ip_hash, timestamp, action_enum; immutable event log.
- **Information Disclosure:** No personal content in DB. AI request/response not logged. Analytics use cohort_id, no user_id in exports.
- **Denial of Service:** Per-user and global rate limits, quota before AI call, CDN bot protection.
- **Elevation of Privilege:** RLS (auth.uid() = user_id). Support cannot access content (structurally absent).

### 9.2 Encryption

- **In transit:** TLS 1.3. Certificate pinning for /ai/chat in Phase 2.
- **At rest (server):** Supabase AES-256.
- **At rest (device):** AES-256-GCM per record; key in SecureStore (Keychain/Keystore).

### 9.3 Key Management

- Device key: generated on first launch, stored in SecureStore, not transmitted.
- User passphrase: PBKDF2; passphrase never stored or transmitted.
- AI API keys: Edge function secrets only.
- Admin secrets: rotated quarterly; runbook with audit.

### 9.4 Content Redaction Policy

- Server logs: no request/response bodies; only endpoint, method, status, latency, user_id_hash, timestamp.
- Error messages: no internal details in production API responses.
- Admin exports: metadata only; export action logged.
- **INV-13 (AI logging):** No AI request or response body may appear in any server log. Enforced by centralised logger wrapper, CI static check (no console.log(req.body)), and runtime guard on BANNED_FIELDS. Test: automated log inspection in staging (see Appendix A).

### 9.5 Data Retention and Deletion

| Data Type | Retention | Deletion Trigger | Deletion Method |
|-----------|-----------|------------------|-----------------|
| Server metadata (active) | Duration of account | Account deletion | Hard delete + audit |
| Server metadata (churned) | 90 days post-churn | Automated | Purge job |
| Audit logs | 2 years | Rolling | Purge job |
| Rate limit state | 30 days | Rolling | Purge |
| AI usage metrics | 1 year aggregate, 30 days per-user | Rolling | Purge |
| Local device data | Until delete app/account | User request | User-initiated purge |
| Analytics aggregate | 3 years | Business decision | Manual with audit |

**Account Deletion Flow:** In-app "Delete my account" → 24h delay option → POST /user/delete → delete all Supabase rows for user_id → client purge Dexie, clear SecureStore → confirmation email → audit USER_ACCOUNT_DELETED. Point-in-time recovery 7 days then purged.

### 9.6 Compliance and Legal Requirements

- Privacy Policy, ToS, consent, age gate (16/18), mental health disclaimer, AI transparency, breach notification, jurisdiction/data residency: lawyer review required before production (GDPR, CCPA, COPPA, etc.).

**Data residency (architectural decision):**

- **Primary production region:** One region only. **Default: EU Central** (e.g. Frankfurt) for stricter GDPR-first compliance baseline. Alternative: US East if faster early iteration is prioritised; then GDPR DPA is required for any EU users.
- **Explicit commitment:** *All production Supabase and Edge functions are deployed in the chosen region.* If EU Central is chosen: "All production Supabase and Edge functions deployed in EU region." If US is chosen: "All production infrastructure deployed in US region." No split-region deployment for production in MVP.
- **Rationale:** EU → GDPR-first baseline, single jurisdiction for data at rest. US → lower latency for US users and faster iteration; DPA and contractual safeguards required for EU users.
- **Invariant (INV-15):** Infrastructure region cannot change without legal review and DPA updates. Any region change is a change-control event requiring sign-off.

---

## 10. Migration Strategy (Legacy to Compliant)

### 10.1 Problem Statement

Legacy system has Supabase tables with user free text (journal_entries.content, conversation_messages.content, check_ins.note, memory_chunks.content, user_reports.summary). Guard existed but was bypassed. Migration must achieve zero free text while maintaining service.

### 10.2 Migration Phases

- **Phase M1 (Week 1):** Freeze and audit. Deploy write-blocking middleware. Audit schema and data. migration_audit table. No delete.
- **Phase M2 (Week 2):** Schema remediation. New _v2 tables without content columns. Migrate metadata. New edge functions. Dual-read mode.
- **Phase M3 (Weeks 3–4):** Client migration. Dexie layer. Idempotent migration flow (see 10.2.1). Force update after 4 weeks.
- **Phase M4 (Weeks 5–6):** Purge legacy. Pre-conditions: Purge Gate Checklist (10.2.2) satisfied. UPDATE/DELETE content; DROP columns. Final audit. Document in audit log.
- **Phase M5 (Week 7):** Verification. Privacy test suite, external review, policy update, user notice.

**10.2.1 Phase M3 — Idempotent migration and crash safety**

- **Server fields (per user):** `migration_started_at`, `migration_completed_at`, `migration_checksum` (hash of content batch). Migration state is stored server-side so the client can resume.
- **Migration flow (mandatory sequence):**
  1. Client fetches legacy content from server (read-only).
  2. Client writes content to Dexie (encrypted).
  3. Client computes checksum over the migrated content batch.
  4. Client sends checksum to server (no content).
  5. Server verifies content length (or item count) matches legacy metadata for that user.
  6. Only after verification does server set `migration_completed_at`. Before that, only `migration_started_at` may be set.
- **Crash safety:** If `migration_started_at` is set but `migration_completed_at` is null, the app must resume migration on next launch (re-fetch, re-write to Dexie, recompute checksum, re-send). No purge of legacy data is allowed until `migration_completed_at` is set for that user.
- **Invariant (INV-14):** No legacy purge is allowed for a user unless `migration_completed_at` exists for that user. Automated test required: assert purge path checks `migration_completed_at` and refuses purge when null.

**10.2.2 Purge Gate Checklist (before Phase M4)**

Before any legacy purge (M4) is executed, all of the following must be recorded and satisfied:

- 100% of active users have `migration_completed_at` set (no user left with migration started but not completed).
- Backup snapshot of legacy content/store created and verified.
- Legal sign-off recorded (e.g. ticket or document reference).
- CTO approval recorded (e.g. ticket or change-control log).

### 10.3 Rollback Plan

- M1–M2: Reversible (legacy tables intact).
- M3: Reversible if purge not executed.
- M4: IRREVERSIBLE. Backup required. CTO and legal sign-off before execute.

### 10.4 User Communication Plan

- Week 1: In-app banner.
- Week 3: Push + email (update available).
- Week 5: Final reminder; support channel.
- Week 7: Completion announcement; privacy policy notification.

---

## 11. Testing and Release Gates

### 11.1 Test Categories

- **Privacy (P0):** TEST-PRIV-01–05 (no content in Supabase, fuzz banned fields, nightly scan).
- **Governance:** TEST-GOV-01–05 (commitment escalation, relapse, focus, determinism, risk_score); plus deterministic equivalence test (client vs server same engine_version).
- **Security:** TEST-SEC-01–06 (JWT, RLS, rate limit, admin claim, payload size, OWASP); plus CI static rule: fail build if console.log(req.body) in edge functions.
- **Functional:** TEST-FUNC-01–05 (onboarding, modes, offline, deletion, subscription).
- **Migration:** Automated test that purge path checks migration_completed_at and refuses purge when null (INV-14).
- **Performance:** TEST-PERF-01–04 (AI latency, governance write, Dexie, cold start).

### 11.2 Definition of Done (Phase 1 MVP)

Privacy and security suites 100% pass; governance tests pass; P95 AI latency < 3000ms; crash-free > 99%; data deletion E2E verified; privacy policy + ToS reviewed; age gate and crisis resource verified; admin MFA enforced.

---

## 12. Roadmap and Phases

- **Phase 0 (Weeks 1–4):** Dexie, metadata-only schema, validation middleware, legacy freeze, privacy tests in CI.
- **Phase 1 MVP (Weeks 5–16):** Emotional interface (vent, listen, coach), loneliness support, journaling, check-ins, commitments (daily), abstinence (basic), subscriptions, admin, migration M1–M5, age gate, legal review.
- **Phase 2 (Weeks 17–28):** Focus sessions, challenge mode, memory chunks, weekly/custom commitments, relapse flow (consultant review), cross-device E2E sync, premium tier, certificate pinning.
- **Phase 3 (Weeks 29+):** Roadmap items (voice, wearables, cohorts, therapist API, multi-language).

### 12.5 Observability Requirements

Instrument from Phase 0. Never capture user content. Metrics: edge error rate, AI latency p95, token usage, rate limit triggers, banned-field rejections, sync queue depth, auth failures, DB utilisation, privacy test pass rate, safety classifier trigger rate.

---

## Layer 2 — Life Orchestration (Proactive Execution Engine)

**Positioning:** Layer 2 expands Vella from a reactive emotional companion into an "emotionally intelligent execution partner." This is not a task manager, not a wellness gimmick, and not an intrusive notification engine. It is a consent-based, context-linked orchestration layer that helps users follow through on intentions they have already declared.

**Relationship to Layer 1:** Layer 1 (Phase 1–2 MVP) establishes emotional trust through conversation, journaling, and basic commitments. Layer 2 introduces proactive execution capabilities only after that trust baseline exists. The user remains in full control; Vella offers structured support, never unsolicited surveillance.

### Goal

Layer 2 delivers the following value proposition:

- **Insight → Commitment → Execution → Follow-up → Accountability → Adaptation** — A closed-loop system where intentions captured in conversation are structured into trackable commitments, executed with contextual support, followed up with evidence-based accountability, and adapted based on outcomes.
- **Proactive but consent-based** — Vella initiates support only in response to explicit user commitments or user-defined triggers. No random "wellness check-ins." No behavior inference without consent.
- **Context-linked nudges only** — Notifications and interventions are tied to specific user-defined contexts (time windows, deviation thresholds, inactivity periods) rather than algorithmic speculation about user state.
- **Trust-first design** — Every proactive feature starts disabled. Granular opt-in per domain. Clear pause/snooze/disable controls. No surprise behaviors.
- **Emotional intelligence meets deterministic execution** — The AI layer provides warm, appropriate framing; the Governance Spine provides deterministic orchestration logic. Neither layer blurs into the other.
- **Accountability without shame** — Misses and relapses are logged factually. The system adapts rather than punishes. Recovery flows are prioritized over streak displays.
- **Progressive disclosure** — Advanced orchestration features (integrations, external calendar write) are hidden until basic commitment flows are mastered.
- **Agency preservation** — The user can override, snooze, or disable any orchestration rule at any time. The system fails closed (stops nudging) rather than failing open (spamming).

### Non-negotiables

These constraints are architectural and ethical invariants for Layer 2:

- **No creepiness:** No unsolicited emotional check-ins. No "you seem stressed" inferences. No ambient monitoring beyond explicit commitment tracking.
- **No OS-level control in the first iteration:** No blocking apps, no DND enforcement, no system-level interventions. Layer 2 operates within the Vella app boundary only.
- **Granular opt-in per domain:** Sleep orchestration, focus blocking, routine nudges, abstinence accountability — each is a separate toggle. No bundled "enable all" without review.
- **Deterministic-first orchestration logic:** All trigger conditions, escalation policies, and nudge cadences are rule-based (Governance Spine). LLMs may format messages but never decide when to send them.
- **Clear user agency:** Every nudge includes actions: start, snooze (with time picker), skip (with optional reason), reschedule. Disable and cadence-change controls are one tap away from any nudge.
- **No server storage of sensitive orchestration context:** Commitment descriptions, personal motivation, trigger contexts remain encrypted on-device. Server stores only commitment metadata (status, schedule windows, outcome counts).
- **Minimal telemetry:** Orchestration analytics use only metadata (nudge delivered, action taken, outcome logged). No free-text analysis on server.

### Core Primitives

Layer 2 introduces four structured primitives. These are data structures, not UI components.

#### Commitment

A structured intention captured from user input (in-session or journal) and confirmed before activation.

```typescript
interface Commitment {
  id: string;                    // UUID
  domain: DomainEnum;            // sleep | focus | routine | abstinence | fitness | social | custom
  target: TargetSpec;            // { type: "duration"|"count"|"boolean", value: number, unit: string }
  schedule: ScheduleSpec;        // { type: "daily"|"weekly"|"window", windows: TimeWindow[], timezone: string }
  successCriteria: Criterion[]; // [{ metric: "duration_mins"|"completed_bool", threshold: number, operator: ">="|"=" }]
  cadence: CadenceEnum;          // daily | weekly | custom
  escalationPolicy: Policy;      // { missThreshold: number, escalationLevels: Level[] }
  createdBy: "user" | "ai_proposal" | "template"; // audit trail
  status: "active" | "paused" | "completed" | "archived";
  createdAt: timestamp;
  // description and personal context: LOCAL ENCRYPTED ONLY
}
```

#### Trigger

A condition that evaluates to true based on deterministic rules. Triggers are the only valid cause for proactive surfaces.

```typescript
interface Trigger {
  id: string;
  type: "time_based" | "deviation_based" | "inactivity_based";
  commitmentId: string;
  guardrails: Guardrail[];       // Prevent spam: maxPerDay, quietHours, cooldownMins
  condition: ConditionSpec;      // Deterministic rule (e.g., "now > window.start && !completedToday")
}
```

**Guardrail examples:**
- `maxPerDay: 3` — Never send more than 3 nudges for any commitment in 24h
- `quietHours: [22:00, 08:00]` — Suppress all nudges during sleep window
- `cooldownMins: 30` — After snooze, wait 30 min before re-evaluation

#### Nudge

A proactive surface containing a message template and required action set.

```typescript
interface Nudge {
  id: string;
  triggerId: string;
  commitmentId: string;
  template: MessageTemplate;     // { base: string, tone: "warm"|"neutral"|"firm", variables: string[] }
  actions: Action[];             // [{ type: "start"|"snooze"|"skip"|"reschedule", payload: object }]
  surface: SurfaceEnum;          // push_notification | in_app_inbox | inline_banner | none (silent log)
  sentAt?: timestamp;
  respondedAt?: timestamp;
  responseAction?: string;
}
```

**Action requirements:**
- `start` — Mark commitment in-progress, surface quick-complete UI
- `snooze` — Pause trigger for user-selected duration (15 min, 1 hr, until tomorrow)
- `skip` — Log skip with optional enum reason (not_feeling_it, conflicting_priority, forgot, emergency)
- `reschedule` — Shift today's window to new time without breaking streak

#### Outcome

Immutable record of commitment result. Append-only. Used for accountability and adaptation.

```typescript
interface Outcome {
  id: string;
  commitmentId: string;
  nudgeId?: string;              // May be user-initiated without nudge
  status: "completed" | "skipped" | "missed" | "rescheduled";
  recordedAt: timestamp;
  windowDate: string;            // ISO date for cadence tracking
  // For completed:
  actualValue?: number;          // Duration, count, etc.
  evidenceType?: "self_report" | "session_log" | "manual"; // source of truth
  // For skipped/missed/rescheduled:
  reasonCode?: ReasonEnum;      // predefined enums only; no free text on server
  // User-facing notes: LOCAL ENCRYPTED ONLY
}
```

**Reason codes (enum, extensible):**
- `voluntary_skip`, `not_feeling_it`, `conflicting_priority`, `external_blocker`, `forgot`, `emergency`, `technical_issue`, `paused_by_user`

### Phased Roadmap (Layer 2)

Layer 2 is delivered in six sub-phases (2.1–2.6), each gated by clear "done when" criteria.

#### 2.1 Commitment Capture (Weeks 17–20)

**Scope:** In-session commitment extraction + journal-based commitment creation + local persistence.

**Deliverables:**
- [ ] AI layer can propose commitments during conversation (user confirms before creation)
- [ ] Journal entry type: "Commitment reflection" with structured capture
- [ ] Commitment creation flow with schedule builder (time windows, cadence picker)
- [ ] Local encrypted storage for commitment description and personal motivation
- [ ] Server metadata schema for commitment (no description field)
- [ ] Onboarding: "What area would you like Vella to help you with?" → domain selection → template proposals

**Done when:**
- User can create, view, and pause a commitment entirely within the app
- Server commitment table contains only metadata; zero free-text columns
- Commitments survive app restart and appear in governance state

**Must NOT exist yet:**
- Proactive nudges (no notification permission request)
- Trigger engine
- Outcome logging beyond manual complete/skip

**Telemetry:** Metadata only (commitment created count by domain, source: session vs journal).

#### 2.2 Orchestration Trigger Engine (Weeks 21–24)

**Scope:** Deterministic trigger evaluation + scheduler hooks + guardrail enforcement.

**Deliverables:**
- [ ] Trigger engine (TypeScript, deterministic, client-side with server verification)
- [ ] Time-based trigger evaluation (is now in window? has completion been logged today?)
- [ ] Deviation-based triggers (session started but not completed within planned duration)
- [ ] Inactivity-based triggers (no check-in for N days, commitment at risk)
- [ ] Guardrail system: maxPerDay, quietHours, cooldownMins, per-domain caps
- [ ] Trigger event logging to governance_events (trigger_fired, trigger_suppressed_by_guardrail)

**Done when:**
- Trigger engine produces deterministic output for all active commitments
- Guardrails successfully suppress excess nudges (test: rapid-fire trigger conditions)
- Server receives trigger events as metadata; no trigger logic depends on LLM

**Must NOT exist yet:**
- Push notifications (surface = in_app_inbox only)
- Nudge templating or AI-generated message variations

**Telemetry:** Trigger fired counts by type, guardrail suppression counts by reason.

#### 2.3 Proactive Surfaces (Weeks 25–28)

**Scope:** Push notifications with actions, in-app inbox, nudge message templating.

**Deliverables:**
- [ ] Push notification infrastructure (FCM/APNs) with action buttons
- [ ] Nudge message templates (warm/neutral/firm) with variable substitution
- [ ] AI layer message formatting: templates are static; AI may polish phrasing but never decides timing
- [ ] In-app inbox: chronological nudge history with outcome badges
- [ ] Notification permission flow: asked only after 3+ commitments created (trust-first)
- [ ] Action handling: start, snooze (time picker), skip (reason enum), reschedule (time picker)

**Done when:**
- User receives first proactive nudge for an active commitment
- All nudge actions work offline and sync on reconnect
- Snooze and skip reasons are logged as enums only

**Must NOT exist yet:**
- Accountability reporting (no "you missed 3 times this week" summaries)
- Weekly review flows
- Adaptation logic (no auto-cadence changes)

**Telemetry:** Nudge sent count by surface, action taken counts by type (start/snooze/skip/reschedule).

#### 2.4 Accountability Loop + Weekly Review + Adaptation (Weeks 29–32)

**Scope:** Outcome aggregation, weekly reflection UI, adaptive cadence suggestions.

**Deliverables:**
- [ ] Outcome logging UI (quick-complete, manual log, edit within 24h)
- [ ] Weekly review surface: "This week in [domain]" — completed count, skip count, pattern highlights
- [ ] Adaptation engine: suggests cadence or schedule changes based on miss patterns (user approves)
- [ ] Streak calculation (deterministic, server-authoritative)
- [ ] Relapse event handling for abstinence commitments (Section 5.4 flow)
- [ ] Risk score integration: high miss rate modulates AI tone in related conversations

**Done when:**
- User can view weekly commitment report with outcome tallies
- User receives adaptation suggestion ("Your evening focus sessions often get skipped. Try morning?") with approve/decline
- Streak and miss counts display accurately; no phantom resets

**Must NOT exist yet:**
- Preference center (permissions still per-domain during creation only)
- Third-party integrations
- Widgets

**Telemetry:** Weekly review opened count, adaptation suggestion approval rate, streak milestone reached count.

#### 2.5 Permissions + Preference Centre (Weeks 33–36)

**Scope:** Granular domain toggles, notification preference management, pause controls.

**Deliverables:**
- [ ] Preference centre UI: list of domains with toggle per orchestration feature
- [ ] Notification settings: per-domain quiet hours, global quiet hours override
- [ ] Pause modes: pause domain (retain commitments, stop triggers), pause all (emergency stop)
- [ ] Snooze history and pattern display ("You've snoozed evening meditation 5 times")
- [ ] Export commitment data (JSON, encrypted, user-owned)

**Done when:**
- User can disable all sleep orchestration without affecting focus orchestration
- Pause all stops all triggers within 1 minute
- Snooze pattern insight surfaces to user (self-awareness, not shame)

**Must NOT exist yet:**
- Calendar integrations
- OS-level DND control
- Wearable data ingestion

**Telemetry:** Permission toggle changes by domain, pause events (count only, no reason).

#### 2.6 Optional Integrations (Weeks 37+)

**Scope:** Calendar read/write, widgets, future platform integrations. All behind explicit opt-in.

**Deliverables:**
- [ ] Calendar read (optional): import events to avoid commitment window conflicts
- [ ] Calendar write (optional): write commitment blocks to external calendar (behind double opt-in)
- [ ] Home screen widget: next commitment window, quick-complete action
- [ ] Integration permission gate: separate toggle from core orchestration, clear data usage explanation

**Done when:**
- User can enable calendar write only after completing 10+ commitments manually
- Widget displays accurate next window without leaking description text
- All integrations can be revoked with one tap; revocation stops data flow immediately

**Gating criteria:**
- All 2.1–2.5 gates satisfied
- Legal review for calendar data handling
- 2.6 launches as "Labs" feature, not default-on

**Telemetry:** Integration enabled counts by type, widget interaction counts.

### Risk Controls

Layer 2 introduces proactive capabilities that carry abuse and fatigue risks. These controls are mandatory:

- **Notification fatigue protections:**
  - Hard cap: max 5 push notifications per day across all domains combined
  - Quiet hours: default 22:00–08:00, user-configurable per domain
  - Cooldown: minimum 30 minutes between nudges for the same commitment
  - Deduplication: if user manually completes commitment within window, suppress scheduled nudge
  - Fatigue detection: if skip rate > 70% for 7 days, system pauses proactive surfaces for that domain and surfaces insight (not blame)

- **Fail-closed permissions:**
  - If user revokes notification permission, all time-based triggers convert to silent inbox nudges (never lost, never spam)
  - If user disables domain, all triggers for that domain stop evaluating immediately
  - If guardrail conflict detected (e.g., maxPerDay exceeded by rule change), system suppresses rather than sends

- **Clear UX for revoke/disable:**
  - Every nudge has visible "Manage" link to preference centre
  - Preference centre accessible from Settings in 2 taps
  - Pause button on every commitment detail screen
  - Account deletion removes all orchestration metadata within 24h (standard deletion flow)

- **No server storage of sensitive free text:**
  - Commitment descriptions, personal motivation, and user notes remain encrypted on-device (existing policy)
  - Reason codes are enums; no "other" free-text field for skip reasons on server
  - AI-generated nudge variations are computed client-side or formatted from templates; no prompt/response storage

- **Consent audit trail:**
  - Governance events track: commitment_created (with createdBy), orchestration_enabled, domain_paused, nudge_permission_granted, integration_enabled
  - User can request audit export of all orchestration decisions affecting them (metadata only)

---

## 13. Incident Response

### 13.1 Severity Levels

- **P0:** Personal content exposed, data loss — immediate (< 30 min).
- **P1:** Service down > 15 min — < 1 hour.
- **P2:** Degraded, feature unavailable — < 4 hours.
- **P3:** Non-critical — next business day.

### 13.2 P0 Data Breach Response

Identify scope → disable affected endpoints (< 30 min) → confirm personal content involvement (72h GDPR clock if yes) → root cause, preserve logs → notify users if content exposed (< 24h) → notify authority (< 72h if applicable) → post-mortem, architecture review, full privacy test suite.

### 13.3 On-Call Runbooks

Edge 5xx spike; AI quota exhausted; DB pool exhausted; rate limit bypass; banned field in production (P0); account deletion failure; admin credential compromise.

---

## Appendix A: Invariant Checklist (Automation Targets)

| ID | Invariant | Test Type | Blocking |
|----|-----------|-----------|----------|
| INV-01 | No free text in any Supabase table | Nightly DB scan | Yes |
| INV-02 | Banned field validation rejects 200+ cases | Unit test | Yes |
| INV-03 | Governance engine deterministic | Property test | Yes |
| INV-04 | AI layer does not write governance state | Integration test | Yes |
| INV-05 | Rate limits enforced per endpoint | Load test | Yes |
| INV-06 | Admin endpoints require admin JWT claim | Security test | Yes |
| INV-07 | User data isolation (RLS) | Security test | Yes |
| INV-08 | Account deletion removes all server rows | Integration test | Yes |
| INV-09 | No AI request/response bodies in logs | Log audit test | Yes |
| INV-10 | Safety classifier blocks prohibited content | Unit test | Yes |
| INV-11 | All edge functions import validation middleware | Static analysis | Yes |
| INV-12 | No service role key in client bundle | Bundle analysis | Yes |
| INV-13 | No AI request or response body in any server log; test via automated log inspection in staging | Log audit test (staging) | Yes |
| INV-14 | No legacy purge unless migration_completed_at exists for that user | Integration test | Yes |
| INV-15 | Infrastructure region cannot change without legal review and DPA updates | Change-control / audit | Yes |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Behaviour OS | The deterministic governance spine. Non-LLM rule engine for commitments, abstinence, focus, risk. |
| Governance Event | Immutable, append-only record. Enums, integers, timestamps only. |
| Governance State | Derived snapshot from events. Computed from event log. |
| Local-first | Writes to local device first; server sync metadata-only. |
| Memory Chunk | Locally-extracted, encrypted context from conversation. Never synced. |
| Risk Score | Deterministic 0–100 from events. Modulates AI tone. Never displayed raw. |
| Safe Metadata | Ids, timestamps, enums, integers, hashes, booleans, codes. No free text. |
| Validation Middleware | Edge layer that rejects banned fields and validates payloads before business logic. |

---

## Changelog — Hardening v1.0 (Architectural Enforcement)

**New Layer Added:**

- **Layer 2 — Life Orchestration (Proactive Execution Engine):** New top-level expansion layer added after Section 12 (Roadmap and Phases). Defines the proactive execution partner positioning, non-negotiables (consent-based, deterministic-first, no creepiness), four core primitives (Commitment, Trigger, Nudge, Outcome), phased roadmap (2.1–2.6 with gating criteria), and risk controls (notification fatigue protection, fail-closed permissions, clear revoke UX, consent audit trail).

**Sections modified:**

- **Section 1.1:** Added INV-06 (No AI request or response body in any server log; test via automated log inspection in staging).
- **Section 3.4:** Added logging enforcement rules (centralised logger, redact body, prohibit console.log in prod, CI fail on console.log(req.body), runtime guard on BANNED_FIELDS, production log level INFO/WARN). Added third-party AI provider log risk mitigation (DPA, training opt-out, retention policy).
- **Section 4.9:** Added `engine_version` to governance_events schema.
- **Section 4.10:** Added `engine_version` to governance_state schema.
- **Section 5:** Added **5.7 Governance Authority and Execution Model** (server authority, client predictive-only, server recomputes from event log, server overwrites on conflict, engine_version, idempotent canonical recomputation, CI deterministic equivalence test).
- **Section 9.4:** Added reference to INV-13 (AI logging), centralised logger, CI and runtime guards.
- **Section 9.6:** Added data residency architectural decision (primary region EU Central default; explicit commitment; rationale; INV-15).
- **Section 10.2:** Expanded Phase M3 with 10.2.1 (idempotent migration, server fields migration_started_at / migration_completed_at / migration_checksum, 6-step flow, crash safety, INV-14). Added 10.2.2 Purge Gate Checklist (100% migrated, backup, legal sign-off, CTO approval).
- **Section 11.1:** Added governance deterministic equivalence test, CI static rule for console.log(req.body), migration automated test for INV-14.
- **Appendix A:** Added INV-13 (AI log), INV-14 (migration purge gate), INV-15 (infrastructure region).

**New invariants added:** INV-06 (Section 1.1), INV-13, INV-14, INV-15 (Appendix A and referenced in Sections 9.4, 9.6, 10.2.1).

**New schema fields added:** `engine_version` (governance_events, governance_state); `migration_started_at`, `migration_completed_at`, `migration_checksum` (server, per-user migration state).

---

**END OF MASTER PLAN**

*Vella Build Contract v1.0 — All rights reserved*
