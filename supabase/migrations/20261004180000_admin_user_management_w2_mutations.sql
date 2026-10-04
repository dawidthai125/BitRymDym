-- W2 Admin User Management — mutations + audit write
-- Freeze: docs/decisions/ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md
-- Does NOT alter premium unique index, profiles role trigger, or rank.

-- ---------------------------------------------------------------------------
-- admin_audit_events (OD-ADMIN-06). History UI is W3 (no SELECT for authenticated).
-- ---------------------------------------------------------------------------
CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_user_number bigint,
  target_user_number bigint,
  action text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_audit_events_action_chk CHECK (
    action IN (
      'ROLE_CHANGE',
      'ADMIN_GRANT',
      'ADMIN_REVOKE',
      'MODERATOR_GRANT',
      'MODERATOR_REVOKE',
      'PREMIUM_TIER_CHANGE',
      'PREMIUM_EXPIRATION_CHANGE'
    )
  )
);

CREATE INDEX admin_audit_events_target_created_idx
  ON public.admin_audit_events (target_user_id, created_at DESC);

CREATE INDEX admin_audit_events_created_idx
  ON public.admin_audit_events (created_at DESC);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_audit_events FROM anon;
REVOKE ALL ON TABLE public.admin_audit_events FROM authenticated;

COMMENT ON TABLE public.admin_audit_events IS
  'Admin role/Premium mutation audit. Inserts only via admin_apply_user_management.';

-- ---------------------------------------------------------------------------
-- admin_apply_user_management — single transaction (role + premium + audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_user_management(
  p_actor_id uuid,
  p_target_id uuid,
  p_new_role public.system_role DEFAULT NULL,
  p_set_premium boolean DEFAULT false,
  p_premium_tier public.premium_tier DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
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
  v_pe_id uuid;
  v_pe_tier public.premium_tier;
  v_pe_active boolean;
  v_pe_expires timestamptz;
  v_old_tier public.premium_tier := 'FREE';
  v_old_active boolean := false;
  v_old_expires timestamptz := NULL;
  v_role_changed boolean := false;
  v_premium_changed boolean := false;
  v_actions text[] := ARRAY[]::text[];
  v_meta jsonb := jsonb_build_object('panel', 'admin_users');
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  IF p_actor_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'ADMIN_FORBIDDEN';
  END IF;

  IF p_set_premium AND p_premium_tier IS NULL THEN
    RAISE EXCEPTION 'INVALID_PREMIUM_TIER';
  END IF;

  IF p_set_premium AND p_premium_tier = 'FREE' AND p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_EXPIRATION';
  END IF;

  IF p_set_premium
     AND p_premium_tier IS DISTINCT FROM 'FREE'
     AND p_expires_at IS NOT NULL
     AND p_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'INVALID_EXPIRATION';
  END IF;

  IF p_new_role IS NOT NULL THEN
    -- Namespace 4242026 / 2002 = BitRymDym admin role mutations (transaction-scoped).
    PERFORM pg_advisory_xact_lock(4242026, 2002);
    PERFORM 1
    FROM public.profiles
    WHERE role = 'ADMIN'
    ORDER BY id
    FOR UPDATE;
  END IF;

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

  SELECT role, user_number
  INTO v_target_role, v_target_number
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;

  SELECT id, tier, active, expires_at
  INTO v_pe_id, v_pe_tier, v_pe_active, v_pe_expires
  FROM public.premium_entitlements
  WHERE user_id = p_target_id
    AND active IS TRUE
  FOR UPDATE;

  IF FOUND THEN
    v_old_tier := v_pe_tier;
    v_old_active := v_pe_active;
    v_old_expires := v_pe_expires;
  END IF;

  IF p_new_role IS NOT NULL THEN
    IF p_actor_id = p_target_id AND p_new_role IS DISTINCT FROM 'ADMIN' THEN
      RAISE EXCEPTION 'SELF_DEMOTION_FORBIDDEN';
    END IF;

    IF p_actor_id = p_target_id AND p_new_role = 'ADMIN' THEN
      NULL;
    ELSIF p_new_role IS DISTINCT FROM v_target_role THEN
      IF v_target_role = 'ADMIN' AND p_new_role IS DISTINCT FROM 'ADMIN' THEN
        SELECT count(*)::integer
        INTO v_admin_count
        FROM public.profiles
        WHERE role = 'ADMIN';

        IF v_admin_count <= 1 THEN
          RAISE EXCEPTION 'LAST_ADMIN_PROTECTED';
        END IF;
      END IF;

      UPDATE public.profiles
      SET role = p_new_role
      WHERE id = p_target_id
        AND role IS DISTINCT FROM p_new_role;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'MUTATION_FAILED';
      END IF;

      v_role_changed := true;
      v_actions := array_append(v_actions, 'ROLE_CHANGE');

      INSERT INTO public.admin_audit_events (
        actor_user_id,
        target_user_id,
        actor_user_number,
        target_user_number,
        action,
        old_value,
        new_value,
        metadata
      ) VALUES (
        p_actor_id,
        p_target_id,
        v_actor_number,
        v_target_number,
        'ROLE_CHANGE',
        jsonb_build_object('role', v_target_role),
        jsonb_build_object('role', p_new_role),
        v_meta
      );

      IF v_target_role IS DISTINCT FROM 'ADMIN' AND p_new_role = 'ADMIN' THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'ADMIN_GRANT',
          jsonb_build_object('role', v_target_role),
          jsonb_build_object('role', p_new_role),
          v_meta
        );
        v_actions := array_append(v_actions, 'ADMIN_GRANT');
      END IF;

      IF v_target_role = 'ADMIN' AND p_new_role IS DISTINCT FROM 'ADMIN' THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'ADMIN_REVOKE',
          jsonb_build_object('role', v_target_role),
          jsonb_build_object('role', p_new_role),
          v_meta
        );
        v_actions := array_append(v_actions, 'ADMIN_REVOKE');
      END IF;

      IF v_target_role IS DISTINCT FROM 'MODERATOR' AND p_new_role = 'MODERATOR' THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'MODERATOR_GRANT',
          jsonb_build_object('role', v_target_role),
          jsonb_build_object('role', p_new_role),
          v_meta
        );
        v_actions := array_append(v_actions, 'MODERATOR_GRANT');
      END IF;

      IF v_target_role = 'MODERATOR' AND p_new_role IS DISTINCT FROM 'MODERATOR' THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'MODERATOR_REVOKE',
          jsonb_build_object('role', v_target_role),
          jsonb_build_object('role', p_new_role),
          v_meta
        );
        v_actions := array_append(v_actions, 'MODERATOR_REVOKE');
      END IF;
    END IF;
  END IF;

  IF p_set_premium THEN
    IF p_premium_tier = 'FREE' THEN
      IF v_pe_id IS NOT NULL AND (v_old_active OR v_old_tier IS DISTINCT FROM 'FREE' OR v_old_expires IS NOT NULL) THEN
        UPDATE public.premium_entitlements
        SET
          active = false,
          tier = 'FREE',
          expires_at = NULL,
          source = 'manual_admin'
        WHERE id = v_pe_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'MUTATION_FAILED';
        END IF;
        v_premium_changed := true;
      END IF;
    ELSE
      IF v_pe_id IS NULL THEN
        INSERT INTO public.premium_entitlements (
          user_id, active, source, expires_at, tier
        ) VALUES (
          p_target_id, true, 'manual_admin', p_expires_at, p_premium_tier
        );
        v_premium_changed := true;
      ELSIF v_old_tier IS DISTINCT FROM p_premium_tier
         OR v_old_active IS DISTINCT FROM true
         OR v_old_expires IS DISTINCT FROM p_expires_at THEN
        UPDATE public.premium_entitlements
        SET
          active = true,
          tier = p_premium_tier,
          expires_at = p_expires_at,
          source = 'manual_admin'
        WHERE id = v_pe_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'MUTATION_FAILED';
        END IF;
        v_premium_changed := true;
      END IF;
    END IF;

    IF v_premium_changed THEN
      IF coalesce(v_old_tier, 'FREE') IS DISTINCT FROM p_premium_tier
         OR (p_premium_tier = 'FREE' AND v_old_active) THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'PREMIUM_TIER_CHANGE',
          jsonb_build_object(
            'premiumTier', v_old_tier,
            'expiresAt', v_old_expires,
            'active', v_old_active
          ),
          jsonb_build_object(
            'premiumTier', p_premium_tier,
            'expiresAt', CASE WHEN p_premium_tier = 'FREE' THEN NULL ELSE p_expires_at END,
            'active', p_premium_tier IS DISTINCT FROM 'FREE'
          ),
          v_meta
        );
        v_actions := array_append(v_actions, 'PREMIUM_TIER_CHANGE');
      END IF;

      IF p_premium_tier IS DISTINCT FROM 'FREE'
         AND v_old_expires IS DISTINCT FROM p_expires_at THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'PREMIUM_EXPIRATION_CHANGE',
          jsonb_build_object('expiresAt', v_old_expires),
          jsonb_build_object('expiresAt', p_expires_at),
          v_meta
        );
        v_actions := array_append(v_actions, 'PREMIUM_EXPIRATION_CHANGE');
      END IF;

      IF p_premium_tier = 'FREE' AND v_old_expires IS NOT NULL THEN
        INSERT INTO public.admin_audit_events (
          actor_user_id, target_user_id, actor_user_number, target_user_number,
          action, old_value, new_value, metadata
        ) VALUES (
          p_actor_id, p_target_id, v_actor_number, v_target_number,
          'PREMIUM_EXPIRATION_CHANGE',
          jsonb_build_object('expiresAt', v_old_expires),
          jsonb_build_object('expiresAt', NULL),
          v_meta
        );
        v_actions := array_append(v_actions, 'PREMIUM_EXPIRATION_CHANGE');
      END IF;
    END IF;
  END IF;

  IF NOT v_role_changed AND NOT v_premium_changed THEN
    RAISE EXCEPTION 'NO_CHANGES';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'roleChanged', v_role_changed,
    'premiumChanged', v_premium_changed,
    'actions', to_jsonb(v_actions)
  );
EXCEPTION
  WHEN raise_exception THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'MUTATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_user_management(
  uuid, uuid, public.system_role, boolean, public.premium_tier, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_apply_user_management(
  uuid, uuid, public.system_role, boolean, public.premium_tier, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.admin_apply_user_management(
  uuid, uuid, public.system_role, boolean, public.premium_tier, timestamptz
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.admin_apply_user_management(
  uuid, uuid, public.system_role, boolean, public.premium_tier, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.admin_apply_user_management(
  uuid, uuid, public.system_role, boolean, public.premium_tier, timestamptz
) IS
  'W2 atomic admin role/Premium mutation + audit. service_role only. Frontend is not AuthZ.';
