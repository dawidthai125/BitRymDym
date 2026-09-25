-- Phase 1.3 — Identity & Access Control foundation
-- Roles / account levels / permission examples from Master SSOT.
-- ROLE ≠ ACCOUNT LEVEL.
-- OD-19 CLOSED: signup default account_level = BEGINNER_RAPPER (approved).
-- OD-20 CLOSED: First ADMIN = MANUAL / OPERATOR-CONTROLLED only (no auto-admin).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.system_role AS ENUM ('ADMIN', 'MODERATOR', 'USER');

-- Working names from SSOT §4; final labels OD-09 OPEN.
CREATE TYPE public.account_level AS ENUM (
  'BEGINNER_RAPPER',
  'PRO_RAPPER',
  'LEGEND_RAPPER'
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  role public.system_role NOT NULL DEFAULT 'USER',
  -- OD-19 CLOSED / ACCEPTED: approved signup default account level.
  account_level public.account_level NOT NULL DEFAULT 'BEGINNER_RAPPER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.role_permissions (
  role public.system_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

CREATE INDEX role_permissions_permission_id_idx ON public.role_permissions (permission_id);

-- SSOT §36 example permission catalog (exact keys — not invented beyond SSOT examples).
INSERT INTO public.permissions (key, description) VALUES
  ('users.view', 'View users'),
  ('users.edit', 'Edit users'),
  ('users.suspend', 'Suspend users'),
  ('beats.create', 'Create beats'),
  ('beats.edit', 'Edit beats'),
  ('beats.delete', 'Delete beats'),
  ('beats.approve', 'Approve beats'),
  ('beats.reject', 'Reject beats'),
  ('tracks.view', 'View tracks'),
  ('tracks.moderate', 'Moderate tracks'),
  ('tracks.remove', 'Remove tracks'),
  ('comments.moderate', 'Moderate comments'),
  ('comments.delete', 'Delete comments'),
  ('reports.view', 'View reports'),
  ('reports.resolve', 'Resolve reports'),
  ('payments.view', 'View payments'),
  ('payments.manage', 'Manage payments'),
  ('settings.view', 'View settings'),
  ('settings.manage', 'Manage settings'),
  ('feature_flags.view', 'View feature flags'),
  ('feature_flags.manage', 'Manage feature flags'),
  ('audit_log.view', 'View audit log');

-- ADMIN: all SSOT example permissions (SSOT §3 Administrator — full access).
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'ADMIN'::public.system_role, p.id FROM public.permissions p;

-- MODERATOR: moderation-oriented subset from SSOT §3 (no payments/settings/feature_flags/audit).
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'MODERATOR'::public.system_role, p.id
FROM public.permissions p
WHERE p.key IN (
  'users.view',
  'users.suspend',
  'beats.approve',
  'beats.reject',
  'tracks.view',
  'tracks.moderate',
  'tracks.remove',
  'comments.moderate',
  'comments.delete',
  'reports.view',
  'reports.resolve'
);

-- USER: no elevated named permissions from §36 (standard platform use).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Block self-escalation of role / account_level for non-service callers.
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.account_level IS DISTINCT FROM OLD.account_level THEN
      IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Changing role or account_level is not allowed for this caller';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_privilege_escalation();

-- Create application profile on Auth signup. Default role = USER (SSOT standard account).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role, account_level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    'USER',
    'BEGINNER_RAPPER'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.system_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Profiles: own row or ADMIN.
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT/DELETE for authenticated users (created by trigger; deleted with auth user).
-- Service role bypasses RLS for operational admin tooling later.

CREATE POLICY permissions_select_authenticated
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY role_permissions_select_authenticated
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);
