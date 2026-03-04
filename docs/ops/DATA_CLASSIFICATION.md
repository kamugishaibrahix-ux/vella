# Data Classification — Vella Platform

## Classification Tiers

| Tier | Description | Storage | Example |
|------|-------------|---------|---------|
| **LOCAL-ONLY** | User-generated content | Device only (IndexedDB) | Journals, messages, check-in notes, voice transcripts |
| **SAFE-METADATA** | Derived/structured server data | Supabase (RLS enforced) | Scores, hashes, timestamps, enum codes, boolean flags |
| **ADMIN-OPERATIONAL** | Admin-written operational data | Supabase (service-role only) | Moderation notes, report summaries, config |
| **FINANCIAL** | Payment/billing records | Supabase (RLS enforced) | Stripe IDs, token balances, subscription status |
| **SYSTEM** | Platform infrastructure | Supabase (service-role only) | Audit logs, analytics counters, migration state |

---

## Table Classification

### LOCAL-ONLY (content stored on device, server stores hashes/metadata)
- `journal_entries_v2` — word_count, local_hash, mood_score (no title/content)
- `conversation_metadata_v2` — message_count, token_count, model_id (no messages)
- `check_ins_v2` — mood/stress/energy/focus scores (no note)
- `memory_chunks_v2` — content_hash only (no content)
- `memory_chunks` — content column DROPPED (M4.5); embedding vectors + hashes only
- `memory_snapshots` — summary_hash + theme codes (no raw summary)
- `memory_clusters` — summary_hash + theme codes (no raw text)

### SAFE-METADATA
- `profiles` — display_name, timezone, theme, language
- `user_preferences` — boolean notification/prompt flags
- `vella_settings` — voice model, tone enums, bounded HUD config
- `user_traits` / `user_traits_history` — numeric resilience/clarity/discipline scores
- `progress_metrics` — numeric progress scores + bounded JSONB
- `connection_depth` — numeric depth score
- `behavioural_state_current` / `_history` — derived state (traits, loops, themes)
- `governance_state` — governance codes and scores
- `behaviour_events` — event type enums + code metadata
- `commitments` / `abstinence_targets` / `focus_sessions` — enum codes + metrics
- `social_models` — derived numeric social model
- `vella_personality` — personality trait scores/codes
- `micro_rag_cache` — RAG metadata (hashes, vectors, scores)
- `health_metrics` — numeric sleep/exercise/recovery/energy signals (no text)
- `health_state_current` — derived numeric health indices + volatility flag + confidence/freshness/staleness
- `financial_entries` — numeric amount + enum category/behavior_flag + suspicious_input boolean (no descriptions, no merchant names)
- `financial_state_current` — derived numeric financial stress indices + confidence/freshness/staleness
- `decisions` — enum decision_type + numeric confidence/intensity scores + suspicious_input boolean (no text)
- `decision_outcomes` — numeric outcome_rating/regret_score + suspicious_input boolean (no text)
- `cognitive_state_current` — derived numeric cognitive performance indices + confidence/freshness/staleness
- `master_state_current` — cross-domain aggregated stability score + enum risk domain + flags + confidence/freshness/staleness
- `system_status_current` — unified OS state: system_phase enum + top_priority_domain enum + urgency_level int + enforcement_mode enum + stability_trend_7d int + confidence/sample_size (no text)
- `resource_budget_current` — daily resource allocations: focus_minutes int + decision_complexity int + spending_tolerance numeric + recovery_hours int + budget_confidence int (no text)
- `system_transition_log` — phase/priority/enforcement change log: enum columns only + triggered_by_domain enum + timestamp (no text)

### ADMIN-OPERATIONAL
- `user_metadata` — plan, status, flags, admin notes (max 500 chars)
- `user_reports` — moderation reports: type, severity, summary (max 500), notes (max 2000)
- `admin_user_flags` — suspended boolean
- `admin_ai_config` — AI config JSON (bounded 64KB)
- `admin_global_config` — global config JSON
- `promo_codes` — discount codes (admin-managed)

### FINANCIAL
- `subscriptions` — plan, status, Stripe IDs, token balance, periods
- `token_topups` — Stripe payment IDs, amount, tokens awarded
- `token_usage` — source, tokens, from_allocation flag
- `token_ledger` — delta, reason code
- `token_rates` — event cost rates (system config)

### SYSTEM
- `admin_activity_log` — audit trail (action codes, state snapshots)
- `system_logs` — runtime events (level, source, code, short message)
- `analytics_counters` — pre-computed counters
- `webhook_events` — Stripe event IDs
- `migration_audit` — row counts and byte estimates
- `migration_state` — per-user migration status
- `migration_export_audit` — export request audit

---

## Feedback Table — Classification Decision

**Table:** `feedback`

**Schema:**
```
id uuid PK
user_id uuid FK → profiles
session_id uuid (optional)
rating integer CHECK (1-10)
channel text CHECK ('voice', 'text')
category text (finite set: clarity, warmth, helpfulness, etc.)
created_at timestamptz
```

**Classification:** SAFE-METADATA

**Rationale:** The `feedback` table stores ONLY numeric ratings and category codes. There are no free-text columns — no `message`, `comment`, or `text` field exists. The `category` column is a finite enum-like set, not open-ended user input. The existing DB comments confirm: "Only numeric ratings and categories, no free-text comments."

**No action required** — table is already compliant with local-first policy.

---

## Retention Policy

| Classification | Retention | Deletion Method |
|----------------|-----------|-----------------|
| LOCAL-ONLY | User-controlled | Device wipe / app uninstall |
| SAFE-METADATA | Account lifetime + 30 days | CASCADE on auth.users deletion |
| ADMIN-OPERATIONAL | Indefinite (operational need) | Anonymize user_id on account deletion |
| FINANCIAL | 7 years (regulatory) | Anonymize identity, retain transaction records |
| SYSTEM | 90 days rolling | Automated cleanup |
