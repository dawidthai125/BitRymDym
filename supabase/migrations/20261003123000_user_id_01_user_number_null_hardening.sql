-- USER-ID-01 hardening: block authenticated NULL → value (and any) user_number UPDATE.
-- Additive for DBs that already applied 20261003110802 with the weaker OLD IS NOT NULL guard.
-- Does not mutate profile rows / sequence. INSERT DEFAULT nextval remains the allocation path.

CREATE OR REPLACE FUNCTION public.prevent_user_number_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_number IS DISTINCT FROM OLD.user_number THEN
      IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'user_number is immutable for this caller';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
