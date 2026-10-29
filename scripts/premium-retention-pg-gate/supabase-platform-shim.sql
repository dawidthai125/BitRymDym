-- Minimal Supabase platform shim for an isolated, throwaway PostgreSQL 17 cluster.
-- Run as the bootstrap superuser (supabase_admin) BEFORE supabase/migrations/*.sql.
-- Mirrors only what the repo migrations reference: platform roles, default privileges,
-- extensions schema, auth.uid()/auth.role()/auth.users, storage.buckets/objects.
-- NOT a Supabase stack: no PostgREST, GoTrue or Storage API. Synthetic data only.

-- Platform roles (supabase/postgres init scripts). postgres is NOT a superuser on Supabase.
CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB REPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT;
CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE;
CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT CREATEROLE;
GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;
GRANT supabase_auth_admin, supabase_storage_admin TO postgres;

-- Supabase default privileges: new objects created by postgres in public are granted
-- directly to anon / authenticated / service_role (REVOKE ... FROM PUBLIC does not undo these).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

-- auth (GoTrue-owned on Supabase)
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;

CREATE TABLE auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  is_anonymous boolean NOT NULL DEFAULT false,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
GRANT ALL ON TABLE auth.users TO postgres;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt()
  TO postgres, anon, authenticated, service_role;

-- storage (Storage API-owned on Supabase)
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  owner uuid,
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  user_metadata jsonb,
  version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets, storage.objects
  TO postgres, anon, authenticated, service_role;
