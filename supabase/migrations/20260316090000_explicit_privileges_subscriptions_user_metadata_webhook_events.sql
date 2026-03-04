-- ==========================================================================
-- EXPLICIT PRIVILEGES: subscriptions, user_metadata, webhook_events
-- ==========================================================================
-- Makes table privileges explicit. RLS remains enabled and policies unchanged.
-- anon: no access. authenticated: scoped by RLS. service_role: full access.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. public.subscriptions
-- --------------------------------------------------------------------------
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.subscriptions FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

GRANT ALL ON public.subscriptions TO service_role;

COMMENT ON TABLE public.subscriptions IS 'User subscription and plan. RLS scopes authenticated to own row. Explicit privileges: anon none, authenticated CRUD, service_role full.';

-- --------------------------------------------------------------------------
-- 2. public.user_metadata
-- --------------------------------------------------------------------------
REVOKE ALL ON public.user_metadata FROM anon;
REVOKE ALL ON public.user_metadata FROM authenticated;

GRANT SELECT ON public.user_metadata TO authenticated;

GRANT ALL ON public.user_metadata TO service_role;

COMMENT ON TABLE public.user_metadata IS 'Admin-managed user metadata. RLS: authenticated read own; writes admin/service only. Explicit privileges: anon none, authenticated SELECT only, service_role full.';

-- --------------------------------------------------------------------------
-- 3. public.webhook_events
-- --------------------------------------------------------------------------
REVOKE ALL ON public.webhook_events FROM anon;
REVOKE ALL ON public.webhook_events FROM authenticated;

GRANT ALL ON public.webhook_events TO service_role;

COMMENT ON TABLE public.webhook_events IS 'Stripe webhook idempotency. Server-only. Explicit privileges: anon none, authenticated none, service_role full.';

-- ==========================================================================
