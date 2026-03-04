# Runtime Write Boundary Audit — 2026-02-28

## Verdict: PASS — No user free-text persisted server-side

All Supabase write operations were audited. Every write uses either `safeInsert`/`safeUpdate`/`safeUpsert` (which call `scanPayload()` to reject banned fields) or validated Zod schemas.

---

## Summary

| Classification | Count | Description |
|----------------|-------|-------------|
| **SAFE** | 85+ | Only structured metadata (IDs, enums, numbers, booleans, timestamps) |
| **REVIEW** | 10 | Admin-written bounded text (notes, summaries, config names) |
| **RISK** | 0 | No raw payload or unbounded user text writes found |

---

## SAFE Writes (structured metadata only)

### MOBILE app/api/ routes
| Route | Table | Fields |
|-------|-------|--------|
| reports/create | `user_reports_v2` | user_id, report_type, severity, status |
| feedback/create | `feedback` | user_id, session_id, rating, channel, category |
| stripe/webhook | `subscriptions` | status, plan, period_start/end |
| stripe/webhook | `token_topups` | user_id, amount, tokens, stripe_payment_intent_id |
| internal/migration/audit | `migration_audit` | environment, auditor, tables (counts), totals |
| admin/user/suspend | `admin_user_flags` | user_id, suspended, suspended_at |

### MOBILE lib/ writes
| Module | Table | Fields |
|--------|-------|--------|
| memory/clustering | `memory_clusters` | hashes, scores, themes, embeddings (no content) |
| memory/consolidation | `memory_snapshots` | hashes, themes, embeddings (no content) |
| journal/db | `journal_entries_v2` | word_count, local_hash, mood_score (no title/content) |
| checkins/db | `check_ins_v2` | mood, stress, energy, focus scores (no note) |
| conversation/db | `conversation_metadata_v2` | message_count, token_count, model_id (no messages) |
| memory/db | `memory_chunks` | content_hash, embedding, token_estimate (no content) |
| execution/commitmentStore | `commitments` | commitment_code, subject_code, target_value |
| execution/outcomeStore | `behaviour_events` | event_type, commitment_id, metadata (codes) |
| governance/events | `behaviour_events` | event_type, subject_code, metadata_code |
| governance/stateEngine | `governance_state` | state_json (derived state codes) |
| engine/behavioural | `behavioural_state_*` | state_json (derived traits/themes) |
| health/healthEngine | `health_state_current` | energy_index, sleep_debt, recovery_index, volatility, confidence, sample_size, freshness, is_stale |
| finance/financeEngine | `financial_state_current` | monthly_spending, impulse_count, savings_ratio, stress_index, confidence, sample_size, freshness, is_stale |
| cognitive/cognitiveEngine | `cognitive_state_current` | avg_confidence, regret_index, bias_score, volatility, confidence, sample_size, freshness, is_stale |
| system/masterStateEngine | `master_state_current` | stability_score, dominant_risk_domain, overload, energy_budget, confidence, sample_size, freshness, is_stale |
| system/recomputeProtocol | `system_status_current` | stability_score, system_phase, top_priority_domain, urgency_level, enforcement_mode, stability_trend_7d, confidence, sample_size |
| system/recomputeProtocol | `resource_budget_current` | max_focus_minutes_today, max_decision_complexity, spending_tolerance_band, recovery_required_hours, budget_confidence |
| system/recomputeProtocol | `system_transition_log` | previous_phase, new_phase, previous_priority_domain, new_priority_domain, previous/new_enforcement_mode, triggered_by_domain |
| budget/usageServer | `token_usage` | source, tokens, from_allocation |
| payments/webhookIdempotency | `webhook_events` | event_id, event_type |
| migration/exportAudit | `migration_export_audit` | export_type, user_id_hash, offset, limit |
| migration/state | `migration_state` | status, timestamps |

---

## REVIEW Writes (admin-only bounded text)

| Route / Module | Table | Text Field | Bound | Access |
|---------------|-------|------------|-------|--------|
| admin/user-reports/create | `user_reports` | summary | DB: ≤500 chars | service-role only |
| admin/user-reports/update | `user_reports` | notes | DB: ≤2000 chars | service-role only |
| admin/users/update-notes | `user_metadata` | notes | DB: ≤500 chars | service-role only |
| admin/users/update-tokens | `admin_activity_log` | metadata.adjustment_reason | Zod: ≤500 chars | service-role only |
| admin/alert-rules/save | `admin_ai_config` | config.rules[].name/condition | Zod: ≤128/256 chars | service-role only |
| admin/config/save | `admin_ai_config` | config (model names) | Zod validated | service-role only |
| admin/reports/update | `user_reports` | notes (resolved_notes) | DB: ≤2000 chars | service-role only |
| admin/promo-codes/create | `promo_codes` | code | DB: ≤64 chars | service-role only |

All REVIEW writes are:
- Admin-only (not user-facing)
- Bounded at DB level (CHECK constraints)
- Validated at API level (Zod schemas)
- NOT user-generated content

---

## Controls in Place

1. **`safeSupabaseWrite` wrapper** — All MOBILE writes go through `safeInsert`/`safeUpdate`/`safeUpsert` which call `scanPayload()` to reject fields named content, message, note, journal, transcript, etc.

2. **DB CHECK constraints** — JSONB columns have `jsonb_has_forbidden_content_keys()` constraint that rejects top-level keys: content, text, message, body, transcript, journal, prompt, response, note, summary.

3. **DB size constraints** — All JSONB columns bounded by `pg_column_size` (4KB–64KB). All admin text columns bounded by `length` constraints.

4. **RLS** — All user-scoped tables enforce `auth.uid() = user_id`. Admin tables deny all non-service-role access.

5. **Zod validation** — All API routes validate input before writing.

---

## Webhook Safety

Stripe webhooks (MOBILE/app/api/stripe/webhook/route.ts):
- Extract only specific fields from Stripe events (subscription ID, status, price ID, amount)
- Never store the full webhook payload
- Write only structured metadata to `subscriptions`, `token_topups`, `webhook_events`
- No raw event body persisted

---

## Conclusion

No runtime write path stores user-generated free text server-side. All text fields that exist are admin-written, bounded, and behind service-role access controls. The `safeSupabaseWrite` layer + DB CHECK constraints provide defense-in-depth.
