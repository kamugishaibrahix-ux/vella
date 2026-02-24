-- Admin C: Moderation tools and promo codes schema

-- 1) Add moderation / review flags to user_metadata

ALTER TABLE user_metadata
ADD COLUMN IF NOT EXISTS shadow_ban boolean NOT NULL DEFAULT false;

ALTER TABLE user_metadata
ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false;

-- 2) Create user_reports table for admin moderation reports

CREATE TABLE IF NOT EXISTS user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_metadata (user_id) ON DELETE CASCADE,
  reported_by uuid NULL REFERENCES user_metadata (user_id),
  type text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  summary text NOT NULL,
  notes text NULL,
  assignee uuid NULL REFERENCES user_metadata (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_reports_user_id_idx ON user_reports (user_id);
CREATE INDEX IF NOT EXISTS user_reports_status_idx ON user_reports (status);

-- 3) Create promo_codes table for admin-managed discount codes

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_percent int NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  applies_to_plan text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  usage_limit int NULL,
  times_used int NOT NULL DEFAULT 0,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_codes_code_idx
  ON promo_codes (code);

CREATE INDEX IF NOT EXISTS promo_codes_applies_to_plan_idx
  ON promo_codes (applies_to_plan);

