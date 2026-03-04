-- Install triggers for auto-provisioning and backfill existing users.
-- Single DO block for Supabase CLI compatibility.
DO $$
BEGIN
  -- Drop existing triggers if they exist
  DROP TRIGGER IF EXISTS on_auth_user_profile_created ON auth.users;
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

  -- Install profile trigger (fires first due to name ordering)
  CREATE TRIGGER on_auth_user_profile_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user_profile();

  -- Install subscription trigger
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user_subscription();

  -- Backfill profiles for existing auth.users
  INSERT INTO public.profiles (id)
  SELECT u.id FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  ON CONFLICT (id) DO NOTHING;

  -- Backfill subscriptions for existing auth.users
  INSERT INTO public.subscriptions (
    user_id, plan, status,
    monthly_token_allocation, monthly_token_allocation_used, token_balance,
    current_period_start, current_period_end,
    created_at, updated_at
  )
  SELECT
    u.id,
    'free'::subscription_plan,
    'active',
    10000, 0, 10000,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    now(), now()
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id)
  ON CONFLICT (user_id) DO NOTHING;
END $$;
