-- Admin: grant / revoke plan add-ons (first one: reference_mastering for Silver).
-- * admin_audit_events: + PLAN_ADDON_GRANT, PLAN_ADDON_REVOKE.
-- * admin_set_plan_addon(): one transaction = close the open grant (if any),
--   insert the new one (grant) and write the audit row. service_role only;
--   the actor must be ADMIN with users.edit (same rule as admin_apply_user_management).
-- Additive; no user data touched by the migration itself.

ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_chk;

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
      'USER_ACCOUNT_DELETE',
      'SAMPLE_POLICY_UPDATE',
      'BEAT_METADATA_UPDATE',
      'SITE_MAINTENANCE_UPDATE',
      'PLAN_ADDON_GRANT',
      'PLAN_ADDON_REVOKE'
    )
  );

CREATE OR REPLACE FUNCTION public.admin_set_plan_addon(
  p_actor_id uuid,
  p_target_id uuid,
  p_addon text,
  p_grant boolean,
  p_ends_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.system_role;
  v_actor_number bigint;
  v_target_number bigint;
  v_has_edit boolean := false;
  v_old public.plan_addon_entitlements%ROWTYPE;
  v_had_old boolean := false;
  v_new_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;
  IF p_actor_id IS NULL OR p_target_id IS NULL OR p_grant IS NULL THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;
  IF p_addon IS DISTINCT FROM 'reference_mastering' THEN
    RAISE EXCEPTION 'ADDON_INVALID';
  END IF;
  IF p_grant AND p_ends_at IS NOT NULL AND p_ends_at <= now() THEN
    RAISE EXCEPTION 'ADDON_ENDS_IN_PAST';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 200 THEN
    RAISE EXCEPTION 'ADDON_NOTE_TOO_LONG';
  END IF;

  SELECT role, user_number INTO v_actor_role, v_actor_number
  FROM public.profiles WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role = v_actor_role AND perm.key = 'users.edit'
  ) INTO v_has_edit;
  IF NOT v_has_edit THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  SELECT user_number INTO v_target_number
  FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;

  SELECT * INTO v_old FROM public.plan_addon_entitlements
  WHERE user_id = p_target_id AND addon = p_addon AND revoked_at IS NULL
  FOR UPDATE;
  v_had_old := FOUND;

  IF NOT p_grant AND NOT v_had_old THEN
    RAISE EXCEPTION 'ADDON_NOT_ACTIVE';
  END IF;

  IF v_had_old THEN
    UPDATE public.plan_addon_entitlements SET revoked_at = now() WHERE id = v_old.id;
  END IF;

  IF p_grant THEN
    INSERT INTO public.plan_addon_entitlements (user_id, addon, source, granted_by, ends_at, note)
    VALUES (p_target_id, p_addon, 'admin', p_actor_id, p_ends_at, v_note)
    RETURNING id INTO v_new_id;
  END IF;

  INSERT INTO public.admin_audit_events (
    actor_user_id, target_user_id, actor_user_number, target_user_number,
    action, old_value, new_value, metadata
  ) VALUES (
    p_actor_id, p_target_id, v_actor_number, v_target_number,
    CASE WHEN p_grant THEN 'PLAN_ADDON_GRANT' ELSE 'PLAN_ADDON_REVOKE' END,
    CASE WHEN v_had_old
      THEN jsonb_build_object('addon', p_addon, 'active', true, 'endsAt', v_old.ends_at)
      ELSE jsonb_build_object('addon', p_addon, 'active', false) END,
    CASE WHEN p_grant
      THEN jsonb_build_object('addon', p_addon, 'active', true, 'endsAt', p_ends_at)
      ELSE jsonb_build_object('addon', p_addon, 'active', false) END,
    jsonb_build_object('panel', 'admin_users', 'note', v_note)
  );

  RETURN jsonb_build_object('ok', true, 'id', v_new_id, 'replaced', v_had_old);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_plan_addon(uuid, uuid, text, boolean, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan_addon(uuid, uuid, text, boolean, timestamptz, text)
  TO service_role;
