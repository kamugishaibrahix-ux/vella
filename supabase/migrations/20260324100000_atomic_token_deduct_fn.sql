CREATE OR REPLACE FUNCTION public.atomic_token_deduct(
  p_user_id       uuid,
  p_request_id    uuid,
  p_tokens        bigint,
  p_source        text,
  p_from_alloc    boolean,
  p_allowance     bigint,
  p_window_start  timestamptz,
  p_window_end    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used           bigint;
  v_topups         bigint;
  v_remaining      bigint;
  v_new_remaining  bigint;
  v_existing_kind  text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'remaining_balance', 0, 'error', 'invalid_user_id');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'remaining_balance', 0, 'error', 'missing_request_id');
  END IF;
  IF p_tokens <= 0 THEN
    RETURN jsonb_build_object('success', false, 'remaining_balance', 0, 'error', 'invalid_token_amount');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0)::bigint);

  SELECT kind INTO v_existing_kind
  FROM public.token_usage
  WHERE user_id = p_user_id AND request_id = p_request_id
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(tokens), 0) INTO v_used
      FROM public.token_usage
     WHERE user_id = p_user_id AND created_at >= p_window_start AND created_at < p_window_end;
    SELECT COALESCE(SUM(tokens_awarded), 0) INTO v_topups
      FROM public.token_topups
     WHERE user_id = p_user_id AND created_at >= p_window_start AND created_at < p_window_end;
    v_remaining := GREATEST(0, p_allowance + v_topups - v_used);
    IF v_existing_kind = 'charge' THEN
      RETURN jsonb_build_object('success', true, 'remaining_balance', v_remaining, 'error', null, 'warning', 'already_charged');
    ELSE
      RETURN jsonb_build_object('success', false, 'remaining_balance', v_remaining, 'error', 'request_id_conflict');
    END IF;
  END IF;

  SELECT COALESCE(SUM(tokens), 0) INTO v_used
    FROM public.token_usage
   WHERE user_id = p_user_id AND created_at >= p_window_start AND created_at < p_window_end;
  SELECT COALESCE(SUM(tokens_awarded), 0) INTO v_topups
    FROM public.token_topups
   WHERE user_id = p_user_id AND created_at >= p_window_start AND created_at < p_window_end;

  v_remaining := GREATEST(0, p_allowance + v_topups - v_used);

  IF v_remaining < p_tokens THEN
    RETURN jsonb_build_object('success', false, 'remaining_balance', v_remaining, 'error', 'insufficient_balance');
  END IF;

  INSERT INTO public.token_usage (user_id, request_id, kind, source, tokens, from_allocation)
  VALUES (p_user_id, p_request_id, 'charge', p_source, p_tokens, p_from_alloc);

  v_new_remaining := v_remaining - p_tokens;

  RETURN jsonb_build_object('success', true, 'remaining_balance', v_new_remaining, 'error', null);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', true, 'remaining_balance', 0, 'error', null, 'warning', 'already_charged');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'remaining_balance', 0, 'error', 'internal_error');
END;
$$;
