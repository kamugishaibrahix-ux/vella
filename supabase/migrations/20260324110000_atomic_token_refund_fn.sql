CREATE OR REPLACE FUNCTION public.atomic_token_refund(
  p_user_id       uuid,
  p_request_id    uuid,
  p_tokens        bigint,
  p_source        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charged_tokens bigint;
  v_existing_refund_kind text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'invalid_user_id');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'missing_request_id');
  END IF;
  IF p_tokens <= 0 THEN
    RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'invalid_token_amount');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0)::bigint);

  SELECT kind INTO v_existing_refund_kind
  FROM public.token_usage
  WHERE user_id = p_user_id AND request_id = p_request_id AND kind = 'refund'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'refunded_amount', 0, 'error', null, 'warning', 'refund_already_processed');
  END IF;

  SELECT tokens INTO v_charged_tokens
  FROM public.token_usage
  WHERE user_id = p_user_id AND request_id = p_request_id AND kind = 'charge'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'original_charge_not_found');
  END IF;

  IF p_tokens > v_charged_tokens THEN
    RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'refund_exceeds_charge');
  END IF;

  INSERT INTO public.token_usage (user_id, request_id, kind, source, tokens, from_allocation)
  VALUES (p_user_id, p_request_id, 'refund', p_source, -p_tokens, false);

  RETURN jsonb_build_object('success', true, 'refunded_amount', p_tokens, 'error', null);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', true, 'refunded_amount', 0, 'error', null, 'warning', 'refund_already_processed');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'refunded_amount', 0, 'error', 'internal_error');
END;
$$;
