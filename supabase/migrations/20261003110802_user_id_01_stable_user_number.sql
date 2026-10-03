-- USER-ID-01 — Stable User Number
-- Cleanup (USER-CLEANUP-01) must already leave only KEEP users (Dawid + Tajski).
-- Dawid := 1; Tajski remains NULL; sequence nextval := 2.
-- UUID Auth remains the relational FK. user_number is operational/UI only.

CREATE SEQUENCE public.user_number_seq AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.profiles
  ADD COLUMN user_number bigint NULL;

ALTER TABLE public.profiles
  ALTER COLUMN user_number SET DEFAULT nextval('public.user_number_seq');

ALTER SEQUENCE public.user_number_seq OWNED BY public.profiles.user_number;

CREATE UNIQUE INDEX profiles_user_number_uidx
  ON public.profiles (user_number)
  WHERE user_number IS NOT NULL;

-- Immutability: authenticated callers cannot change user_number at all
-- (NULL → value, value → value, value → NULL). INSERT DEFAULT nextval is unaffected
-- (this trigger is BEFORE UPDATE only). service_role = documented operator recovery only.
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

CREATE TRIGGER profiles_prevent_user_number_mutation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_number_mutation();

-- Seed Dawid = 1 (CONFIRMED OWNER UUID). Do not touch Tajski (NULL).
UPDATE public.profiles
SET user_number = 1
WHERE id = 'fdf04726-e971-42a7-9d46-8b9bdd099c23'
  AND user_number IS NULL;

-- Next allocated number must be 2.
SELECT setval('public.user_number_seq', 1, true);

-- RLS unchanged: profiles_select_own_or_admin (own OR is_admin).
-- MODERATOR deliberately has no profiles SELECT for others → no foreign user_number.
