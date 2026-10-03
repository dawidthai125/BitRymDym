-- Align profiles privilege trigger with award RPC (service_role JWT or postgres maintainer).

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.account_level IS DISTINCT FROM OLD.account_level
       OR NEW.experience_total IS DISTINCT FROM OLD.experience_total THEN
      IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
         AND current_user IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION
          'Changing role, account_level, or experience_total is not allowed for this caller';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
