-- ==========================================================================
-- PREFLIGHT: Detect potential content storage in cache/model tables
-- ==========================================================================
-- Run BEFORE applying 20260227_root_harden_cache_tables.sql.
-- Reports rows that might violate size or content constraints.
-- READ-ONLY. No mutations.
-- ==========================================================================

-- 1) micro_rag_cache: rows exceeding 32KB
SELECT 'micro_rag_cache' AS table_name,
       COUNT(*) AS oversized_count
FROM public.micro_rag_cache
WHERE pg_column_size(data) > 32768;

-- 2) micro_rag_cache: sample oversized rows (limit 20)
SELECT user_id,
       pg_column_size(data) AS data_bytes,
       updated_at
FROM public.micro_rag_cache
WHERE pg_column_size(data) > 32768
ORDER BY pg_column_size(data) DESC
LIMIT 20;

-- 3) micro_rag_cache: check for forbidden text-like keys in JSONB
-- Looks for keys that suggest user content: content, text, body, message,
-- note, transcript, journal, prompt, response
SELECT user_id,
       key AS suspicious_key,
       pg_column_size(data) AS data_bytes
FROM public.micro_rag_cache,
     LATERAL jsonb_object_keys(data) AS key
WHERE key IN ('content', 'text', 'body', 'message', 'note', 'transcript',
              'journal', 'prompt', 'response', 'entry', 'summary')
LIMIT 50;

-- 4) social_models: rows exceeding 16KB
SELECT 'social_models' AS table_name,
       COUNT(*) AS oversized_count
FROM public.social_models
WHERE pg_column_size(model) > 16384;

-- 5) vella_personality: rows exceeding 8KB
SELECT 'vella_personality' AS table_name,
       COUNT(*) AS oversized_count
FROM public.vella_personality
WHERE pg_column_size(traits) > 8192;

-- 6) Summary
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM micro_rag_cache WHERE pg_column_size(data) > 32768) = 0
     AND (SELECT COUNT(*) FROM social_models WHERE pg_column_size(model) > 16384) = 0
     AND (SELECT COUNT(*) FROM vella_personality WHERE pg_column_size(traits) > 8192) = 0
    THEN 'SAFE: No oversized rows. Constraint migration can proceed.'
    ELSE 'BLOCKED: Oversized rows exist. Truncate or quarantine before applying constraints.'
  END AS preflight_result;
