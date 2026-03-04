CREATE OR REPLACE FUNCTION public.jsonb_has_forbidden_keys(obj jsonb)
RETURNS boolean AS $$
DECLARE
  key text;
  forbidden_keys text[];
BEGIN
  forbidden_keys := public.get_forbidden_content_keys();

  FOR key IN SELECT jsonb_object_keys(obj)
  LOOP
    IF key = ANY(forbidden_keys) THEN
      RETURN true;
    END IF;
  END LOOP;

  FOR key IN SELECT DISTINCT jsonb_object_keys(value)
    FROM jsonb_each(obj)
    WHERE jsonb_typeof(value) = 'object'
  LOOP
    IF key = ANY(forbidden_keys) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
