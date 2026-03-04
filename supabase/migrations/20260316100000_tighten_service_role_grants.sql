--
-- Migration: 20260246_tighten_service_role_grants.sql
-- Principle of least privilege: replace broad GRANT ALL for service_role with
-- explicit privileges per table. Backend code receives only the minimum rights
-- needed (e.g. webhook_events is append-only: SELECT + INSERT only).
-- Anon/authenticated revokes are left unchanged.
--

-- subscriptions: service_role needs full CRUD for sync with Stripe and plan reads
REVOKE ALL PRIVILEGES ON TABLE public.subscriptions FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO service_role;

-- user_metadata: service_role needs full CRUD for admin and profile updates
REVOKE ALL PRIVILEGES ON TABLE public.user_metadata FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_metadata TO service_role;

-- webhook_events: append-only idempotency log; no UPDATE/DELETE
REVOKE ALL PRIVILEGES ON TABLE public.webhook_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.webhook_events TO service_role;
