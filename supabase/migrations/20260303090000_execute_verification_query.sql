-- RPC for structural seal verification: run read-only verification query and return rows as jsonb.
-- Used by MOBILE/lib/security/systemSeal.ts validateStructuralSealingWithDB (service_role only).

CREATE OR REPLACE FUNCTION public.execute_verification_query(p_query text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY EXECUTE (
    'SELECT row_to_json(t)::jsonb FROM (' || p_query || ') t'
  );
END;
$$;

COMMENT ON FUNCTION public.execute_verification_query(text) IS 'Phase seal: run read-only verification query; returns rows as jsonb. service_role only.';

REVOKE EXECUTE ON FUNCTION public.execute_verification_query(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_verification_query(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_verification_query(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_verification_query(text) TO service_role;
