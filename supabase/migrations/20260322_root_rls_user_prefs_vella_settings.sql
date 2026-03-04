-- ==========================================================================
-- B1 FIX: Enable RLS on user_preferences and vella_settings
-- ==========================================================================
-- Both tables are user-scoped (PK = user_id → auth.users).
-- Neither has RLS, meaning any authenticated user can read/write any row.
-- Fix: Enable RLS + per-user isolation policies.
-- ==========================================================================

-- -----------------------------------------------------------------------
-- 1) user_preferences
-- -----------------------------------------------------------------------
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_delete_own" ON public.user_preferences;
CREATE POLICY "user_preferences_delete_own" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_preferences IS 'Per-user notification/prompt preferences. Boolean flags only, no free text. RLS enforced.';

-- -----------------------------------------------------------------------
-- 2) vella_settings
-- -----------------------------------------------------------------------
ALTER TABLE public.vella_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vella_settings_select_own" ON public.vella_settings;
CREATE POLICY "vella_settings_select_own" ON public.vella_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_settings_insert_own" ON public.vella_settings;
CREATE POLICY "vella_settings_insert_own" ON public.vella_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_settings_update_own" ON public.vella_settings;
CREATE POLICY "vella_settings_update_own" ON public.vella_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vella_settings_delete_own" ON public.vella_settings;
CREATE POLICY "vella_settings_delete_own" ON public.vella_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Bound voice_hud JSONB size (default schema is ~130 bytes; allow generous 4KB)
ALTER TABLE public.vella_settings
  DROP CONSTRAINT IF EXISTS vella_settings_voice_hud_max_size;
ALTER TABLE public.vella_settings
  ADD CONSTRAINT vella_settings_voice_hud_max_size
  CHECK (pg_column_size(voice_hud) <= 4096);

-- Bound text config columns
ALTER TABLE public.vella_settings
  DROP CONSTRAINT IF EXISTS vella_settings_text_lengths;
ALTER TABLE public.vella_settings
  ADD CONSTRAINT vella_settings_text_lengths
  CHECK (
    length(voice_model) <= 64
    AND length(tone) <= 64
    AND length(tone_style) <= 64
    AND length(relationship_mode) <= 64
  );

COMMENT ON TABLE public.vella_settings IS 'Per-user voice/tone configuration. Enum-like text columns + bounded JSONB. No user content. RLS enforced.';
COMMENT ON COLUMN public.vella_settings.voice_hud IS 'HUD widget toggles. Bounded JSONB (max 4KB). No user-generated content.';
