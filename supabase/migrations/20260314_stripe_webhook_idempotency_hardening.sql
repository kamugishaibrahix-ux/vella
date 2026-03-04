-- ==========================================================================
-- STRIPE WEBHOOK IDEMPOTENCY HARDENING (Phase 1.3) - CONSTRAINTS ONLY
-- ==========================================================================
-- Purpose: Add unique constraints for idempotency (functions require manual setup)
-- ==========================================================================

-- Step 1: Unique index on token_topups.stripe_payment_intent_id
CREATE UNIQUE INDEX IF NOT EXISTS token_topups_stripe_pi_unique 
ON public.token_topups(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON INDEX public.token_topups_stripe_pi_unique IS 
  'Prevents duplicate token credits for same Stripe payment intent. NULL values allowed.';

-- Step 2: Unique constraint on webhook_events.event_id
DO $$
BEGIN
    ALTER TABLE public.webhook_events 
    DROP CONSTRAINT IF EXISTS webhook_events_event_id_unique;
    
    ALTER TABLE public.webhook_events 
    ADD CONSTRAINT webhook_events_event_id_unique 
    UNIQUE (event_id);
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Constraint already exists';
END $$;

-- Step 3: Index for fast webhook event lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id_lookup 
ON public.webhook_events(event_id);

-- NOTE: Functions moved to manual setup due to CLI prepared statement limitations
