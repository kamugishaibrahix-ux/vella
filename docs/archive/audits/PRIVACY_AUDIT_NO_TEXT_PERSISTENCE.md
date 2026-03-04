# Strict Privacy Audit — No Text Persistence Anywhere

**Rules:** Supabase cannot store personal/free-text. Server must not log, persist, or transmit user free-text except to the AI provider for response generation. No request body logging, no console logging of payloads, no Sentry/telemetry capturing message/history/memory_summary.

**Mode:** Read-only. All findings with file path and line references.

---

## 1) Logging of request bodies or message content

Search covered: `console.log` / `console.error` / `console.warn` / `logger.*` / `captureException` / `analytics.track` and terms: message, history, memory_summary, content, req.body, body:, payload.

**Findings:**

| File path | Line(s) | What is logged/captured | Risk level | How to fix (high level) |
|----------|--------|-------------------------|------------|--------------------------|
| `app/session/page.tsx` | 386–387, 390, 392, 396 | `trimmed` (assistant message text) in multiple console.logs | **High** | Remove or guard all console.logs that include `trimmed`/message content; use dev-only and never log user or assistant text. |
| `app/session/page.tsx` | 423, 428 | `[VoiceMode] Transcript:` + `text` (user speech); `[UI] assistant message arrived:` + `text` | **High** | Same: remove or dev-only, never log transcript or assistant text. |
| `components/chat/ChatPanel.tsx` | 61, 67 | `handleSubmit invoked with message:` + `message`; `onSend invoked for message:` + `message` | **High** | Remove or guard; never log `message` content (user free text). |
| `components/chat/ChatPanel.tsx` | 129, 137, 148, 151 | `RECORD_CHUNKS`, `TRANSCRIBE_STATUS`, `TRANSCRIBE_PAYLOAD:` + `data`, `FINAL_TRANSCRIPT:` + `transcript` | **High** | `data` and `transcript` are user speech; remove or never log. Do not log response body of /api/transcribe. |
| `lib/ai/textEngine.ts` | 27 | `[Persona:TEXT] persona hash:` + hash (derived from full prompt) | **Medium** | Hash alone is not user text; ensure prompt/content is never logged. If persona hash is considered sensitive, log only in dev or remove. |
| `lib/realtime/realtimeClient.ts` | 583 | `[SERVER:EMIT] assistant_message emitted:` + `full` (assistant text) — dev only | **High** | Remove or keep behind a dev flag that is off in production; never log `full` in prod. |
| `lib/realtime/realtimeClient.ts` | 596–597, 599–602 | `[RT:SERVER] output_text.delta` + `msg.delta`; `[SERVER:DELTA] raw delta` + `msg` — dev only | **High** | Deltas and msg can contain assistant text; remove or dev-only, never in prod. |
| `lib/realtime/realtimeClient.ts` | 755, 760–761 | `[DC:INCOMING] raw event.data:`; `[SERVER:MSG] parsed message type:` + full `msg`; `[DC:INCOMING:PARSED]` + `msg` — dev only | **High** | `event.data` and `msg` can contain user/assistant content; remove or dev-only. |
| `lib/realtime/realtimeClient.ts` | 766 | `[RealtimeClient] failed to parse message` + `err`, `event.data` | **High** | `event.data` may include raw message content; log only error type/code, never event.data. |
| `lib/realtime/realtimeClient.ts` | 1125 | `[TEXT:CLIENT] Sent conversation.item.create and response.create for:` + `trimmed` (user message) — dev only | **High** | Remove or dev-only; never log user message. |
| `lib/realtime/useRealtimeVella.ts` | 1177–1180 | `[HOOK:ASSISTANT] raw assistant_message event:` + `extended`; `[ASSISTANT:HOOK] raw incoming:` + `trimmed` | **High** | `extended`/`trimmed` are assistant text; remove or dev-only. |
| `lib/telemetry/voiceTelemetry.ts` | 24, 30 | `[VoiceTelemetry]` logs full `payload`; in prod line 30 logs entire payload | **Medium** | Ensure payload/context never contains user or assistant text; if context can include transcripts or messages, strip before logging. |
| `lib/telemetry/voiceTelemetry.ts` (via logEmotionalArc) | 35–42 | `context: { arc }` — arc is derived (sentiment, intensity, arc), not raw text | **Low** | Confirm no caller passes raw user text in context; document that only derived metadata is allowed. |
| `lib/security/observability.ts` | 70 | `console.log(LOG_PREFIX, JSON.stringify(payload))` — payload is SecurityEventMeta (route, outcome, latencyMs, hashed userId/ip) | **None** | No user content; keep as-is. |
| `app/api/vella/text/route.ts` | 173 | `console.error("[Vella Text Endpoint] Error:", err)` | **Medium** | Ensure `err` is not augmented with request body/message; log only error message and code, not stack or context that might contain user input. |
| `app/check-in/page.tsx` | 217–219, 222, 233, 236, etc. | `[STOIC] note text:` + stoic.quote (system quote); mood/stress numbers; reload/aurora debug logs; `err?.message`, `err?.stack` | **Low–Medium** | stoic.quote is system content; err.message/stack could theoretically contain server-side snippets—log only error code/name in production. Remove or gate verbose debug logs. |
| `app/timeline/page.tsx` | 108 | `console.log("🧠 Locale in UI:", ...)` — locale only | **Low** | No user text; optional to remove in prod. |

**Not logged (verified):**  
- No `logger.*`, `captureException`, `analytics.track`, or `Sentry.*` in codebase.  
- `logSecurityEvent` only logs route, outcome, latencyMs, hashed userId/ip (no message/history/memory_summary).  
- `logPromptSignature` is a no-op (no table); only persona hash is computed, not logged to Supabase.

---

## 2) Middleware, API handlers, and error handlers that might serialize request bodies

| Location | Behavior | Risk |
|----------|----------|------|
| `middleware.ts` (lines 25–34) | Only checks `isMaintenanceMode()` and pathname; does not read `req.body` or any request body. | **None** — no body serialization. |
| API handlers | No grep hit for `req.body` or `request.body` being logged. Body is parsed for validation and business logic only (e.g. `req.json()` then Zod). | **Low** — ensure no handler later adds logging of parsed body (see table above for ChatPanel/session/realtime). |
| Error handlers | Many routes use `console.error("...", err)`. If any error object is ever augmented with request body (e.g. in a catch that does `err.body = body`), that would leak. Current code does not do that. | **Medium** — standard practice: log only `err.message` or error code, never attach or log request body. |

---

## 3) Third-party telemetry (Sentry, PostHog, Vercel, etc.)

| Check | Result |
|-------|--------|
| **Dependencies** | `package.json`: no `@sentry/*`, `posthog`, `vercel` analytics, or similar. No Sentry/PostHog/Vercel Analytics in the project. |
| **Capture by default** | N/A — no such SDKs present. |
| **Vercel** | If deployed on Vercel, platform may log request URLs and status; body capture is not enabled by default. Rely on Vercel docs; no app-level config found that sends body. |
| **Voice telemetry** | `lib/telemetry/voiceTelemetry.ts`: logs to `console.log` only (no external service). Payload can include `context`; must not contain user/assistant text (see table above). |

**Conclusion:** No third-party telemetry SDKs in use. Only console and server-local audit storage (see below) can persist or expose data.

---

## 4) Audit logger persistence (server-local files)

| File path | Line(s) | What is logged/captured | Risk level | How to fix (high level) |
|----------|--------|-------------------------|------------|--------------------------|
| `lib/audit/logger.ts` | 15–27, 30 | Persists to server local (`.vella/audit_events:${userId}.json`). Payload includes `metadata` as stored. | **High** | See below. |
| `lib/realtime/useRealtimeVella.ts` | 1131–1137 | `logAuditEvent({ type: "USER_MESSAGE", metadata: { text: transcript, safeText: safeUserText } })` | **High** | User speech (transcript) is persisted to disk. Remove `text` and `safeText` from metadata; store at most event type and timestamp. |
| `lib/realtime/useRealtimeVella.ts` | 1211–1215 | `logAuditEvent({ type: "ASSISTANT_MESSAGE", metadata: { text: finalAssistantText } })` | **High** | Assistant reply is persisted to disk. Remove `text` from metadata; store at most event type and timestamp. |
| `lib/audit/logger.ts` | 30 | On failure: `console.error("[AUDIT] failed to persist audit event", error, event)` — logs full `event` (which can contain metadata.text) | **High** | Do not log `event` when it contains user/assistant text; log only event type and error. |

**Conclusion:** Audit events currently persist **user transcript** and **assistant message text** to server-local JSON files under `.vella/`. This violates “no persistence of user free-text anywhere.” Fix: stop storing any `text`/`safeText` (and any other free text) in audit metadata; persist only event type, route, timestamp, and non-sensitive flags.

---

## 5) Report table (consolidated)

| File path | Line | What is logged/captured | Risk level | How to fix (high level) |
|-----------|------|-------------------------|------------|--------------------------|
| `app/session/page.tsx` | 386–387, 390, 392, 396, 423, 428 | Assistant message text, user transcript | High | Remove or dev-only; never log message/transcript in prod. |
| `components/chat/ChatPanel.tsx` | 61, 67, 129, 137, 148, 151 | User message, transcript, transcribe response payload | High | Remove or guard; never log message, transcript, or response body. |
| `lib/realtime/realtimeClient.ts` | 583, 596–602, 755, 760–761, 766, 1125 | Assistant text, deltas, raw msg, event.data, user trimmed | High | Remove or dev-only; never log content in prod; on parse error log only error, not event.data. |
| `lib/realtime/useRealtimeVella.ts` | 1177–1180 | Assistant message (extended, trimmed) | High | Remove or dev-only. |
| `lib/audit/logger.ts` | 15–27, 30 | Audit payload (can include metadata.text) to `.vella/` + console on error | High | Stop storing text in audit metadata; on error do not log full event. |
| `lib/realtime/useRealtimeVella.ts` | 1131–1137, 1211–1215 | USER_MESSAGE (transcript, safeText), ASSISTANT_MESSAGE (text) to serverLocal | High | Persist only event type/timestamp; remove text/safeText from metadata. |
| `lib/ai/textEngine.ts` | 27 | Persona hash (derived from prompt) | Medium | Ensure prompt/content never logged; optionally log hash only in dev. |
| `lib/telemetry/voiceTelemetry.ts` | 24, 30 | Full payload; context can be passed by callers | Medium | Restrict payload/context to non-text metadata; document no user/assistant text. |
| `app/api/vella/text/route.ts` | 173 | Error object in catch | Medium | Log only error message/code; never attach or log request body. |
| `app/check-in/page.tsx` | 217–219, 222, 233, 236, 241–246, etc. | Stoic quote (system), mood/stress, err.message/stack | Low–Medium | No user free text in quote; gate debug logs; in prod log only error code. |

---

## 6) Confirmation: /api/vella/text and persistence after planned refactor

**Current behavior (before refactor):**

- **Writes to Supabase:** Yes. `app/api/vella/text/route.ts` lines 127–128, 152, 187 call `insertConversationMessage(userId, { role, content, session_id })` for both user and assistant messages. So **message content is persisted to `conversation_messages`**.
- **Writes to files/cache/queues:** No. No other persistence in this route.
- **Logging:** Line 173 logs `err` in catch (no body or message logged directly). Line 189 calls `logSecurityEvent` with metadata only (no content).

**After planned refactor (from BACKEND_COMPLIANCE_AND_WIRING_PLAN.md):**

- **Supabase:** Must not write message or history. Remove all `insertConversationMessage` calls from `/api/vella/text`. Do not read from or write to `conversation_messages`.
- **Files / cache / queues:** Plan does not introduce any file, cache, or queue writes for message/history/memory_summary. Confirm no new code path persists request body or response reply.
- **Logging:** Ensure no new console.log/error includes `message`, `history`, `memory_summary`, or reply content. Keep using only `logSecurityEvent` (metadata only) and, if logging errors, only error message/code.

**Explicit confirmation:** After the planned refactor is applied:

- `/api/vella/text` must **NOT** write `message` or `history` (or `memory_summary`) to Supabase, files, cache, or queues.
- The only acceptable transmission of user text is in the single request to the AI provider for response generation; the reply is returned in the HTTP response only and must not be persisted server-side.

---

**End of report.** No code was modified; findings are from static search and file reads.
