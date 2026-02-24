# Supabase Migration Cleanup Plan

## Analysis Summary

**Total Local Files:** 23  
**Remote Versions:** 13  
**Duplicates to Remove:** 10 files  
**Invalid Timestamps:** 1 file (20260000)  
**Files to Consolidate:** 10 files into 3 files

## Complete Migration Listing

| Filename | Timestamp | Name | Duplicate? | Invalid? | Action |
|----------|-----------|------|------------|---------|--------|
| 20241117_add_core_tables.sql | 20241117 | add_core_tables | No | No | KEEP |
| 20250101000000_vella_core_admin.sql | 20250101000000 | vella_core_admin | No | No | KEEP |
| 20250101_drop_sensitive_tables.sql | 20250101 | drop_sensitive_tables | No | No | KEEP |
| 20250217_token_engine.sql | 20250217 | token_engine | No | No | KEEP |
| 20250218_add_adaptive_traits.sql | 20250218 | add_adaptive_traits | Yes | No | KEEP (primary) |
| 20250218_add_checkin_metrics.sql | 20250218 | add_checkin_metrics | Yes | No | DELETE (duplicate) |
| 20250218_add_goals.sql | 20250218 | add_goals | Yes | No | DELETE (duplicate) |
| 20250219_add_nudge_history.sql | 20250219 | add_nudge_history | No | No | KEEP |
| 20250220_micro_rag_cache.sql | 20250220 | micro_rag_cache | Yes | No | CONSOLIDATE |
| 20250220_progress_connection.sql | 20250220 | progress_connection | Yes | No | CONSOLIDATE |
| 20250220_progress.sql | 20250220 | progress | Yes | No | CONSOLIDATE |
| 20250220_social_model.sql | 20250220 | social_model | Yes | No | CONSOLIDATE |
| 20250220_vella_personality.sql | 20250220 | vella_personality | Yes | No | CONSOLIDATE |
| 20250221_connection_depth.sql | 20250221 | connection_depth | Yes | No | CONSOLIDATE |
| 20250221_last_active.sql | 20250221 | last_active | Yes | No | CONSOLIDATE |
| 20250221_progress_connection_schema.sql | 20250221 | progress_connection_schema | Yes | No | CONSOLIDATE |
| 20250222_add_last_active_at.sql | 20250222 | add_last_active_at | No | No | KEEP |
| 20250223_remove_checkin_note.sql | 20250223 | remove_checkin_note | No | No | KEEP |
| 20251129154622_create_admin_global_config.sql | 20251129154622 | create_admin_global_config | No | No | KEEP |
| 20251219_drop_legacy_vella_settings_fields.sql | 20251219 | drop_legacy_vella_settings_fields | No | No | KEEP |
| 20251220_add_vella_settings_language.sql | 20251220 | add_vella_settings_language | Yes | No | CONSOLIDATE |
| 20251220_fix_vella_settings_schema.sql | 20251220 | fix_vella_settings_schema | Yes | No | CONSOLIDATE |
| 20260000_fix_migration_engine.sql | 20260000 | fix_migration_engine | No | Yes | RENAME to 20250102 |

## Consolidation Plan

### 20250220 - Consolidate 5 files into 1
**New file:** `20250220_add_feature_tables.sql`
**Content:** Merge all 5 files:
- micro_rag_cache table
- progress_metrics table (from progress.sql)
- progress_connection columns (alter table)
- social_models table
- vella_personality table

### 20250221 - Consolidate 3 files into 1
**New file:** `20250221_add_progress_features.sql`
**Content:** Merge all 3 files:
- connection_depth table
- last_active column (alter profiles)
- progress_connection_schema (full table creation with all columns)

### 20251220 - Consolidate 2 files into 1
**New file:** `20251220_fix_vella_settings.sql`
**Content:** Merge both files:
- add language column
- fix schema (add/drop columns)

## Execution Plan

1. **RENAME:** 20260000_fix_migration_engine.sql → 20250102_fix_migration_engine.sql
2. **DELETE:** 20250218_add_checkin_metrics.sql
3. **DELETE:** 20250218_add_goals.sql
4. **CONSOLIDATE:** Create 20250220_add_feature_tables.sql (merge 5 files)
5. **DELETE:** 20250220_micro_rag_cache.sql
6. **DELETE:** 20250220_progress_connection.sql
7. **DELETE:** 20250220_progress.sql
8. **DELETE:** 20250220_social_model.sql
9. **DELETE:** 20250220_vella_personality.sql
10. **CONSOLIDATE:** Create 20250221_add_progress_features.sql (merge 3 files)
11. **DELETE:** 20250221_connection_depth.sql
12. **DELETE:** 20250221_last_active.sql
13. **DELETE:** 20250221_progress_connection_schema.sql
14. **CONSOLIDATE:** Create 20251220_fix_vella_settings.sql (merge 2 files)
15. **DELETE:** 20251220_add_vella_settings_language.sql
16. **DELETE:** 20251220_fix_vella_settings_schema.sql

## Final Clean Migration List (13 files)

1. 20241117_add_core_tables.sql
2. 20250101000000_vella_core_admin.sql
3. 20250101_drop_sensitive_tables.sql
4. 20250102_fix_migration_engine.sql (renamed from 20260000)
5. 20250217_token_engine.sql
6. 20250218_add_adaptive_traits.sql
7. 20250219_add_nudge_history.sql
8. 20250220_add_feature_tables.sql (new consolidated)
9. 20250221_add_progress_features.sql (new consolidated)
10. 20250222_add_last_active_at.sql
11. 20250223_remove_checkin_note.sql
12. 20251129154622_create_admin_global_config.sql
13. 20251219_drop_legacy_vella_settings_fields.sql
14. 20251220_fix_vella_settings.sql (new consolidated)

**Total: 14 files (matches remote history + 1 fix_migration_engine)**

