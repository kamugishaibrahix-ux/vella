CREATE OR REPLACE FUNCTION public.is_numeric_jsonb_array(input jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT
        input IS NULL
        OR (
            jsonb_typeof(input) = 'array'
            AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(input) elem
                WHERE jsonb_typeof(elem) <> 'number'
            )
        );
$$;
