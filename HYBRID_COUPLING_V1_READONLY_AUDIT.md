# Hybrid Coupling v1 — STRICT READ-ONLY AUDIT
**No code changes. Evidence only. MOBILE/ scope.**

---

## Executive verdicts

| Area | Verdict | Summary |
|------|--------|--------|
| **Storage invariants** | **COMPLIANT** | No writes to legacy content tables; WRITE_BLOCKED_TABLES enforced on all safeInsert/safeUpdate/safeUpsert; vella/text writes only to conversation_metadata_v2 (metadata only). |
| **Governance state read** | **COMPLIANT** | readState.ts reads safely, returns defaults on missing/error; state is computed by stateEngine and internal governance daily route. |
| **Mode resolver + validation** | **COMPLIANT** | Precedence rules match spec; mode is allowlist-validated (z.enum); untrusted strings cannot reach resolveMode. |
| **Coupling quality** | **PARTIAL** | Spine→Interface: governance read and finalMode flow are correct; mode is applied as **USER** content (string prepended to prompt), not SYSTEM—weak/cosmetic from a “strong contract” perspective. |
| **Safety parity** | **PARTIAL** | filterUnsafeContent applied to text AI reply before return; logGuard/observability do not log body/reply; guided-exercise reply is **not** filtered (static scripts only). |
| **Crisis bridge event** | **COMPLIANT** | recordEvent signature and validation respected; 4th param is numericValue→metadata; metadata keys/values numeric-only; no subject_code abuse; semantics reuse scheduler_tick by design (no dedicated crisis type). |

---

## A) Storage invariant regression scan

### A.1 Writes to legacy content tables

**Evidence:**

- **WRITE_BLOCKED_TABLES** (safeSupabaseWrite.ts 49–55): `journal_entries`, `conversation_messages`, `check_ins`, `memory_chunks`, `user_reports`. **user_nudges is NOT in the set** — no app code found that writes to user_nudges (grep: only types and migrationPurge test mock).
- **All write paths use safe*:** safeInsert/safeUpdate/safeUpsert (safeSupabaseWrite.ts 180–217) each call `ensureNotBlockedTable(table)` (169–177) before scanPayload and client write.
- **Conversation:** conversation/db.ts 79–80 — only `safeInsert("conversation_metadata_v2", ...)`. No insert/update/upsert to `conversation_messages`.
- **Journal:** journal/db.ts 87–88, 111–112 — `safeInsert("journal_entries_v2", ...)`, `safeUpdate("journal_entries_v2", ...)`. No legacy `journal_entries`.
- **Check-ins:** checkins/db.ts 97–98, 131–132, 148 — `safeInsert("check_ins_v2", ...)`, `safeUpdate("check_ins_v2", ...)`. No legacy `check_ins`.
- **Memory:** memory/db.ts 66, 109 — `safeUpsert("memory_chunks", ...)`, `safeUpdate("memory_chunks", ...)`. `memory_chunks` is in WRITE_BLOCKED_TABLES → these throw SafeDataError (docstring lib/memory/db.ts 4–5).
- **Reports:** reports/create/route.ts 42–43 — `safeInsert("user_reports_v2", ...)` with report_type, severity, status only (no summary/notes).

**Finding:** No app code writes to legacy content tables. user_nudges is not in WRITE_BLOCKED_TABLES but no write path to it exists in MOBILE.

### A.2 WRITE_BLOCKED_TABLES usage

**Evidence:** safeSupabaseWrite.ts 186–189 (safeInsert), 199–201 (safeUpdate), 212–214 (safeUpsert): each calls `ensureNotBlockedTable(table)` before any write. So all write paths that go through safeInsert/safeUpdate/safeUpsert are blocked for the five listed tables.

### A.3 vella/text route writes

**Evidence:** app/api/vella/text/route.ts:

- Normal path: 201–207 — `recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: estimatedTokens, modelId: "vella_text", mode_enum: finalMode })`.
- Exercise path: 137 — same with messageCount: 2, tokenCount: 0, mode_enum: finalMode.
- recordConversationMetadataV2 (lib/conversation/db.ts 62–85) builds insert with user_id, started_at, ended_at, mode_enum, message_count, token_count, model_id — no content/message/reply. Table: conversation_metadata_v2 (79).

**Finding:** vella/text writes only to conversation_metadata_v2; no text fields written to Supabase.

---

## B) Governance state read correctness

### B.1 readState.ts

**Evidence:** MOBILE/lib/governance/readState.ts:

- 30–33: Reads via `fromSafe("governance_state").select("state_json").eq("user_id", userId).maybeSingle()`.
- 35–37: On error or !data returns `{ ...DEFAULTS }`.
- 39–42: If state_json missing or not object, returns DEFAULTS.
- 44–50: Each field read with typeof checks; fallback to DEFAULTS per field. No direct property access that could throw.

**Finding:** Safe read; robust parsing; no throw on missing keys (optional chaining and typeof guards).

### B.2 governance_state computed in backend

**Evidence:**

- lib/governance/stateEngine.ts 41: `computeGovernanceState(userId)` — reads behaviour_events, commitments, abstinence_targets, focus_sessions; computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level; upserts governance_state (144).
- app/api/internal/governance/daily/route.ts 12, 50: Imports and calls `computeGovernanceState(userId)` for each user with a profile.

**Finding:** State is computed server-side by stateEngine; daily route triggers it. Read path does not compute.

---

## C) Mode resolver correctness + enforcement

### C.1 modeResolver.ts precedence

**Evidence:** MOBILE/lib/ai/modeResolver.ts 21–39:

- Line 27–29: `if (escalationLevel >= 2) return "crisis";`
- Line 31–33: `if (requestedMode === "challenge" && riskScore >= 6) return "coach";`
- Line 35–37: `if (requestedMode != null && requestedMode !== "") return requestedMode;`
- Line 39: `return DEFAULT_MODE;` (listen).

**Finding:** Matches spec: escalation ≥ 2 → crisis; risk ≥ 6 blocks challenge → coach; null/empty → DEFAULT_MODE.

### C.2 Validation and untrusted input

**Evidence:**

- lib/security/validationSchemas.ts 32, 37–44: `vellaModeSchema = z.enum(["vent", "listen", "challenge", "coach", "crisis"])`; vellaTextRequestSchema has `mode: vellaModeSchema.optional().nullable()` and `.strict()`.
- app/api/vella/text/route.ts 122–131: `parseResult = vellaTextRequestSchema.safeParse(json)`; on success `requestedMode = parseResult.data.mode`; `resolveMode(requestedMode ?? null, governance)`. Invalid mode fails parse; no raw string passed to resolveMode.

**Finding:** Mode is allowlist-validated; untrusted strings cannot reach resolveMode.

---

## D) Coupling quality (key test)

### D.1 How mode is applied in textEngine

**Evidence:** MOBILE/lib/ai/textEngine.ts 31, 41–45:

- Line 31: `const content = context?.mode ? \`[Mode: ${context.mode}]\n\n${prompt}\` : prompt;`
- Lines 41–45: `messages: [{ role: "user", content }]` — single message, role **"user"**.

**Finding:** Mode is injected as **USER** content (prefix to the same user message). It is **not** a separate system message or system instruction. So coupling is “a string prepended to the user message” — weak from a strict “system instruction” contract perspective; model can ignore or underweight it.

### D.2 vella/text route flow

**Evidence:** app/api/vella/text/route.ts:

- 130: `governance = await getGovernanceStateForUser(userId);` (before AI).
- 131: `finalMode = resolveMode(requestedMode ?? null, governance);`
- 178: `runVellaTextCompletion(prompt, userId, { mode: finalMode });`
- 201–207: `recordConversationMetadataV2(..., mode_enum: finalMode);`

**Finding:** Governance read happens before AI; finalMode is used in the AI call and persisted to conversation_metadata_v2.mode_enum. Flow is correct; only the *strength* of mode application (user vs system) is weak.

---

## E) Safety parity

### E.1 filterUnsafeContent on text output

**Evidence:** app/api/vella/text/route.ts 191, 211–212: `safeReply = await filterUnsafeContent(reply)`; response returns `reply: safeReply`. Raw reply is not returned.

**Finding:** Text AI output is filtered before return.

### E.2 No logs capturing raw reply/body

**Evidence:**

- lib/security/logGuard.ts 7–34: SENSITIVE_KEYS includes "reply", "message", "content", "body", etc.; redactValue/key redacts those; installLogGuard() wraps console.log/error/warn (62–71).
- lib/security/observability.ts 59–72: logSecurityEvent logs only requestId, routeName, outcome, latencyMs, userIdHash, ipHash — no body or reply.
- lib/ai/textEngine.ts 34: Only `console.log("[Persona:TEXT] persona hash:", personaHash)` — hash only; logPromptSignature is no-op (lib/supabase/usage/logPromptSignature.ts 6–13).

**Finding:** No path logs raw reply or request body.

### E.3 Voice vs text parity

**Evidence:** Realtime (useRealtimeVella.ts) applies filterUnsafeContent to user transcript (1136) and assistant text (1186). Text route applies filter to AI reply only. Guided-exercise path (route 136–151) returns exerciseReply from getBreathingExercise() etc. without filterUnsafeContent.

**Finding:** Parity for AI-generated text (both filtered). Guided-exercise reply is unfiltered (static scripted content) — minor gap.

---

## F) Crisis bridge event correctness

### F.1 recordEvent signature and validation

**Evidence:**

- lib/governance/events.ts 52–58: `recordEvent(userId, eventType, subjectCode?, numericValue?, metadataCode?)`.
- Lines 60–70: metadata_code = { numeric_value (if numericValue set), ...metadataCode }; payload has user_id, event_type, occurred_at, optional subject_code, optional metadata_code. Validated via validateGovernancePayload("BehaviourEventInsert", payload).
- lib/governance/validation.ts 92–100: BehaviourEventInsertSchema has event_type enum, subject_code z.enum(GOVERNANCE_SUBJECT_CODES).optional(), metadata_code governanceMetadataSchema (optional record: string → number | codeString | isoTimestamp).

**Finding:** Signature and validation are well-defined.

### F.2 Crisis call mapping

**Evidence:** app/api/vella/text/route.ts 194–197:

```ts
recordEvent(userId, "scheduler_tick", undefined, governance.escalationLevel, {
  escalation_level: governance.escalationLevel,
  risk_score: governance.riskScore,
});
```

- 3rd param: subjectCode = undefined → no subject_code in payload. subject_code must be one of GOVERNANCE_SUBJECT_CODES (smoking, alcohol, focus, habit, other) when present — not used here.
- 4th param: numericValue = governance.escalationLevel (number) → in events.ts 61 merged as metadata.numeric_value.
- 5th param: metadataCode = { escalation_level, risk_score } (numbers) → merged into metadata. Keys and values are valid per governanceMetadataSchema (string key, number value).

**Finding:** 4th param is numericValue (metadata), not subject_code. Metadata keys escalation_level and risk_score with numeric values are allowed. No type or schema violation.

### F.3 Append-only and semantics

**Evidence:** behaviour_events: only safeInsert in events.ts (99); no update/delete in app code. Event type "scheduler_tick" is in GOVERNANCE_EVENT_TYPES (validation 47–55). Using scheduler_tick for “crisis turn” is a semantic reuse (no dedicated risk_escalation_detected type); does not break append-only or validation.

**Finding:** No violation; design choice is reuse of scheduler_tick for crisis signalling.

---

## G) Tests and failures

**Evidence:** Run:

- test/ai/modeResolver.test.ts — 6 passed
- test/api/vellaTextRoute.test.ts — 4 passed  
- test/security/validationSchemas.test.ts — 39 passed (includes vellaTextRequestSchema + mode)

**Finding:** All 49 hybrid-coupling–relevant tests pass. No failures that block shipping of Hybrid Coupling v1.

---

## Scorecard

| Criterion | Status | Evidence reference |
|-----------|--------|--------------------|
| Storage: no legacy writes | ✅ | A.1, A.3 |
| Storage: WRITE_BLOCKED_TABLES used | ✅ | A.2 |
| Storage: vella/text metadata-only | ✅ | A.3 |
| Governance: readState safe + defaults | ✅ | B.1 |
| Governance: state computed in backend | ✅ | B.2 |
| Mode: resolver precedence correct | ✅ | C.1 |
| Mode: enum allowlist, no untrusted | ✅ | C.2 |
| Coupling: governance read before AI | ✅ | D.2 |
| Coupling: finalMode to AI + metadata | ✅ | D.2 |
| Coupling: mode as system instruction | ❌ | D.1 — mode is USER content prefix |
| Safety: filter on text reply | ✅ | E.1 |
| Safety: no raw reply/body in logs | ✅ | E.2 |
| Safety: exercise reply filtered | ⚠️ | E.3 — not filtered (static script) |
| Crisis bridge: signature + validation | ✅ | F.1, F.2 |
| Crisis bridge: no subject_code abuse | ✅ | F.2 |
| Tests: modeResolver + route + schema | ✅ | G |

---

## “Loaded guns” (can break prod or contract later)

1. **user_nudges not in WRITE_BLOCKED_TABLES** — If any code later does safeInsert("user_nudges", ...) with free text, it will not be blocked. Today no such path exists (safeTables.ts, grep).
2. **Mode as user-message prefix** — Model can ignore or underweight `[Mode: crisis]`; no hard system instruction. Changing prompt shape or model could make mode ineffective without any code change to “coupling”.
3. **Guided-exercise reply unfiltered** — Scripted content from getBreathingExercise() etc. is returned without filterUnsafeContent; if those strings ever become user-dependent or external, they would bypass safety filter.
4. **recordEvent fire-and-forget** — Crisis branch uses `void recordEvent(...).catch(() => {})`; failures are swallowed. Downstream analytics or compliance that assume “crisis → event” could miss events.
5. **Governance state freshness** — getGovernanceStateForUser reads current row; if daily job has not run, state may be stale. No TTL or “recompute if stale” in the text route.
6. **logGuard not in test** — Docstring says “except in test” (logGuard.ts 82); tests could log sensitive data if they console.log reply/body.
7. **conversation_metadata_v2.mode_enum default** — db.ts defaults to "listen" when mode_enum is null; any caller that omits mode_enum gets "listen". Consistent but implicit.
8. **BANNED_FIELDS vs ALLOWED_LONG_STRING** — governance_state.state_json is allowed long string; if someone writes free text into state_json in stateEngine, it would pass (stateEngine only writes codes/numbers today — stateEngine 115–122).

---

## Concrete “next fixes” (max 10, evidence-tied)

1. **Add user_nudges to WRITE_BLOCKED_TABLES** if nudges must never store server-side free text (evidence: safeSupabaseWrite.ts 49–55; user_nudges absent).
2. **Strengthen coupling:** Pass mode as a **system** message or dedicated system instruction in textEngine (evidence: textEngine.ts 41–45 — mode in user content only).
3. **Apply filterUnsafeContent to guided-exercise reply** for parity (evidence: route 136–151 returns exerciseReply unfiltered).
4. **Log or metric when crisis recordEvent fails** instead of swallowing (evidence: route 194–197 .catch(() => {})).
5. **Consider “recompute if stale” for governance_state** in text route when escalationLevel or riskScore are critical (evidence: readState only reads; stateEngine called from daily job only).
6. **Document scheduler_tick semantics** when used for crisis (e.g. “crisis turn” vs “scheduled tick”) to avoid misinterpretation in analytics (evidence: F.3).
7. **Optional: add risk_escalation_detected to GOVERNANCE_EVENT_TYPES** and migration for enum if product wants distinct event type (evidence: F.3 — current reuse of scheduler_tick).
8. **Ensure no test code logs reply/body** in vella or governance tests (evidence: logGuard 82 — disabled in test).
9. **Keep BANNED_FIELDS and state_json allowlist in sync** if stateEngine ever adds new keys (evidence: stateEngine 115–122; safeSupabaseWrite 65).
10. **No change required for crisis bridge schema** — 4th param and metadata are correct; only semantics (scheduler_tick reuse) are a product choice.

---

## Fake coupling callout

**“Mode is only a string prepended to the user message”:**  
The spine (governance_state, risk_score, escalation) correctly gates mode (crisis forced, challenge blocked when risk ≥ 6) and that finalMode is stored and passed into the model. So the **decision** is hybrid and correct. The **application** of mode to the model is weak: the model sees `[Mode: crisis]\n\n<prompt>` as a single user message. There is no separate system instruction like “You are in crisis mode; prioritize grounding and safety.” So behaviour change in the LLM is not contractually guaranteed — it’s suggestive. To make coupling “strong,” mode would need to be applied as a system-level instruction or equivalent, not only as user-content prefix.

---

*End of audit. No code changes; evidence only.*
