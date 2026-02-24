-- Migration: Create webhook_events table for Stripe webhook idempotency
-- Prevents double-processing of webhook events on retries

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by event_id (used in idempotency checks)
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);

-- Index for cleanup queries (remove old events)
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON public.webhook_events(processed_at);

-- RLS: Service role only (webhooks run with service role key)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No user access - only service role can insert/select
-- This is intentional since webhooks are server-side only
CREATE POLICY "Service role only" ON public.webhook_events
  FOR ALL
  USING (false);

COMMENT ON TABLE public.webhook_events IS 'Stores processed Stripe webhook event IDs to prevent double-processing on retries';
COMMENT ON COLUMN public.webhook_events.event_id IS 'Stripe event ID (e.g., evt_xxx)';
COMMENT ON COLUMN public.webhook_events.event_type IS 'Stripe event type (e.g., checkout.session.completed)';
COMMENT ON COLUMN public.webhook_events.processed_at IS 'When the event was successfully processed';
