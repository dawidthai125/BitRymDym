-- W4 Admin User Management — USER_ACCOUNT_DELETE audit action + last-admin delete assert
-- Freeze: docs/decisions/ADMIN_USER_DELETE_DESIGN_FREEZE.md
-- Does NOT create a new audit table, permission, premium/rank/account_level/user_number change.
-- Does NOT relax RLS or grant audit DML to anon/authenticated.

-- ---------------------------------------------------------------------------
-- Extend admin_audit_events.action CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT admin_audit_events_action_chk;

ALTER TABLE public.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_chk CHECK (
    action IN (
      'ROLE_CHANGE',
      'ADMIN_GRANT',
      'ADMIN_REVOKE',
      'MODERATOR_GRANT',
      'MODERATOR_REVOKE',
      'PREMIUM_TIER_CHANGE',
      'PREMIUM_EXPIRATION_CHANGE',
      'USER_ACCOUNT_DELETE'
    )
  );

COMMENT ON TABLE public.admin_audit_events IS
  'Admin mutation audit. W2 inserts via admin_apply_user_management. W4 USER_ACCOUNT_DELETE via service_role after Auth delete.';

-- ---------------------------------------------------------------------------
-- admin_assert_user_deletable — same advisory lock as W2 role mutations
-- Lock namespace 4242026 / 2002. Transaction-scoped. service_role only.
-- Does NOT perform Auth/Storage deletion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assert_user_deletable(
  p_actor_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.system_role;
  v_actor_number bigint;
  v_target_role public.system_role;
  v_target_number bigint;
  v_has_edit boolean := false;
  v_admin_count integer;
  v_premium_active boolean := false;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  IF p_actor_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  -- Same serialization as admin_apply_user_management role changes.
  PERFORM pg_advisory_xact_lock(4242026, 2002);
  PERFORM 1
  FROM public.profiles
  WHERE role = 'ADMIN'
  ORDER BY id
  FOR UPDATE;

  SELECT role, user_number
  INTO v_actor_role, v_actor_number
  FROM public.profiles
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  IF v_actor_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    INNER JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role = v_actor_role
      AND perm.key = 'users.edit'
  )
  INTO v_has_edit;

  IF NOT v_has_edit THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  IF p_actor_id = p_target_id THEN
    RAISE EXCEPTION 'SELF_DELETE_FORBIDDEN';
  END IF;

  SELECT role, user_number
  INTO v_target_role, v_target_number
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;

  IF v_target_role = 'ADMIN' THEN
    SELECT count(*)::integer
    INTO v_admin_count
    FROM public.profiles
    WHERE role = 'ADMIN';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN_PROTECTED';
    END IF;
  END IF;

  SELECT coalesce(bool_or(active IS TRUE), false)
  INTO v_premium_active
  FROM public.premium_entitlements
  WHERE user_id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'targetRole', v_target_role,
    'targetUserNumber', v_target_number,
    'actorUserNumber', v_actor_number,
    'premiumActive', v_premium_active
  );
EXCEPTION
  WHEN raise_exception THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'MUTATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assert_user_deletable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assert_user_deletable(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_assert_user_deletable(uuid, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.admin_assert_user_deletable(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_assert_user_deletable(uuid, uuid) IS
  'W4 last-admin/self-delete assert. Same advisory lock as W2. service_role only. Frontend is not AuthZ.';
