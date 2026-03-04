-- Migration: Align Free plan monthly token allocation to 10,000 tokens
-- Created: 2026-03-03
-- Purpose: Ensure Free plan consistently has 10k monthly tokens across all subscriptions
-- Scope: Only affects subscriptions with plan = 'free'
-- Pro and Elite plans are NOT affected

UPDATE subscriptions
SET monthly_token_allocation = 10000
WHERE plan = 'free';

-- Verification query (commented out, run manually if needed):
-- SELECT plan, monthly_token_allocation, COUNT(*) 
-- FROM subscriptions 
-- WHERE plan = 'free'
-- GROUP BY plan, monthly_token_allocation;
