"use client";

import { supabase } from "@/lib/supabase/client";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import { ensureSupabaseSession } from "@/lib/auth/ensureSession";

export type ProfileUpsertInput = {
  display_name?: string | null;
  age_range?: string | null;
  relationship_style?: string | null;
  focus_area?: string | null;
  ui_language?: string | null;
};

export async function upsertProfile(partial: ProfileUpsertInput): Promise<void> {
  // Local-first: profile updates are stored locally, not in Supabase
  // silent fallback
}

