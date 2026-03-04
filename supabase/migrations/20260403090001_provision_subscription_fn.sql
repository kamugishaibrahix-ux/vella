-- Auto-provision a free subscription when a new auth.users row is created.
-- Ensures profile exists first (FK requirement), then inserts subscription.
-- SECURITY DEFINER so the trigger can write regardless of RLS.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Ensure profile exists (FK: subscriptions.user_id -> profiles.id)
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  -- Insert free subscription
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    monthly_token_allocation,
    monthly_token_allocation_used,
    token_balance,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'free'::subscription_plan,
    'active',
    10000,
    0,
    10000,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
