-- Migration: Add age_range, relationship_style, focus_area, ui_language to profiles table
-- Run this migration in your Supabase SQL editor

-- Add new columns to profiles table if they don't exist
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS relationship_style TEXT,
  ADD COLUMN IF NOT EXISTS focus_area TEXT,
  ADD COLUMN IF NOT EXISTS ui_language TEXT;

-- Ensure RLS is enabled (if not already)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and update their own profile
-- (Adjust if you have different policies)
CREATE POLICY IF NOT EXISTS "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

