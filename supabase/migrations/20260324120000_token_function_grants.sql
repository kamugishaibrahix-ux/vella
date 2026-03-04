DO $$
BEGIN
  EXECUTE 'COMMENT ON FUNCTION public.atomic_token_deduct(uuid, uuid, bigint, text, boolean, bigint, timestamptz, timestamptz) IS ''Atomic token deduction with per-user advisory lock and idempotency. Fail-closed. SECURITY DEFINER.''';
  EXECUTE 'COMMENT ON FUNCTION public.atomic_token_refund(uuid, uuid, bigint, text) IS ''Atomic token refund with request_id correlation. Idempotent. SECURITY DEFINER.''';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_deduct(uuid, uuid, bigint, text, boolean, bigint, timestamptz, timestamptz) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_deduct(uuid, uuid, bigint, text, boolean, bigint, timestamptz, timestamptz) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_deduct(uuid, uuid, bigint, text, boolean, bigint, timestamptz, timestamptz) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.atomic_token_deduct(uuid, uuid, bigint, text, boolean, bigint, timestamptz, timestamptz) TO service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_refund(uuid, uuid, bigint, text) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_refund(uuid, uuid, bigint, text) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.atomic_token_refund(uuid, uuid, bigint, text) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.atomic_token_refund(uuid, uuid, bigint, text) TO service_role';
END $$;
