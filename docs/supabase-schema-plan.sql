-- Vella Control Supabase Schema Plan (NOT a migration)
-- This file defines the exact tables and fields we will migrate later.



-- TABLE: admin_global_config
-- Stores the entire AI configuration in JSON form.
CREATE TABLE admin_global_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL
);



-- TABLE: user_metadata
-- Mirrors non-sensitive metadata from the Vella app.
CREATE TABLE user_metadata (
  user_id uuid PRIMARY KEY,
  plan text NOT NULL,
  token_balance integer NOT NULL DEFAULT 0,
  token_refill_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- TABLE: token_ledger
-- Tracks numeric token usage and purchased tokens.
CREATE TABLE token_ledger (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);



-- TABLE: subscriptions
-- Mirrors Stripe subscription state.
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  plan text NOT NULL,
  renews_at timestamptz,
  cancel_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- TABLE: system_logs
CREATE TABLE system_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);



-- TABLE: analytics_counters
CREATE TABLE analytics_counters (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);



-- TABLE: admin_activity_log
CREATE TABLE admin_activity_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  previous jsonb,
  next jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

