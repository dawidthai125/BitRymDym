-- Reference mastering + mastering styles (Studio gaps, 2026-10-30).
--
-- * plan_addon_entitlements — paid add-ons on top of a plan (first one:
--   reference_mastering for Silver; Gold has it included, Free/Bronze never).
--   Granted by an admin until payments exist. Owner reads own rows; writes service_role.
-- * studio_master_references — a private reference track uploaded for one
--   project (audio-artifacts/studio-reference/{owner}/{project}/{id}/ref.{ext},
--   ≤ 40 MiB parts). Deleted right after the master job that used it, at the
--   latest 24 h after upload (expires_at, swept by the E3 master worker).
-- * studio_master_jobs: style + intensity, reference + intensity, stage 'reference'.
-- * claim_studio_master_job: same quota rule, now also stores style/reference and
--   validates that the reference belongs to the same owner + project and is ready.

-- 1) Add-ons -----------------------------------------------------------------
create table if not exists public.plan_addon_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  addon text not null check (addon in ('reference_mastering')),
  source text not null default 'admin' check (source in ('admin', 'purchase', 'promo')),
  granted_by uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint plan_addon_entitlements_window check (ends_at is null or ends_at > starts_at)
);
create unique index if not exists plan_addon_entitlements_one_open
  on public.plan_addon_entitlements (user_id, addon) where revoked_at is null;

alter table public.plan_addon_entitlements enable row level security;
drop policy if exists plan_addon_entitlements_select_own on public.plan_addon_entitlements;
create policy plan_addon_entitlements_select_own on public.plan_addon_entitlements
  for select to authenticated using (user_id = auth.uid());
revoke all on public.plan_addon_entitlements from anon, authenticated;
grant select on public.plan_addon_entitlements to authenticated;
grant select, insert, update, delete on public.plan_addon_entitlements to service_role;

create or replace function public.has_plan_addon(p_user_id uuid, p_addon text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.plan_addon_entitlements e
     where e.user_id = p_user_id and e.addon = p_addon and e.revoked_at is null
       and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()));
$$;
revoke all on function public.has_plan_addon(uuid, text) from public, anon, authenticated;
grant execute on function public.has_plan_addon(uuid, text) to service_role;

-- 2) Reference uploads -------------------------------------------------------
create table if not exists public.studio_master_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  object_key text not null check (object_key ~ '^studio-reference/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/ref\.(mp3|wav)$'),
  file_name text not null check (length(file_name) between 1 and 120),
  format text not null check (format in ('mp3', 'wav')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 209715200),
  parts smallint not null default 1 check (parts between 1 and 5),
  duration_ms integer not null check (duration_ms between 1000 and 600000),
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  deleted_at timestamptz
);
create index if not exists studio_master_references_project_idx on public.studio_master_references (project_id, created_at desc);
create index if not exists studio_master_references_owner_idx on public.studio_master_references (owner_id);
create index if not exists studio_master_references_sweep_idx on public.studio_master_references (expires_at) where status <> 'deleted';

create or replace function public.studio_master_references_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.studio_projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'STUDIO_REFERENCE_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if new.object_key not like 'studio-reference/' || new.owner_id::text || '/' || new.project_id::text || '/' || new.id::text || '/%' then
    raise exception 'STUDIO_REFERENCE_KEY_MISMATCH' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists studio_master_references_guard on public.studio_master_references;
create trigger studio_master_references_guard before insert or update of owner_id, project_id, object_key on public.studio_master_references
  for each row execute function public.studio_master_references_guard();
revoke all on function public.studio_master_references_guard() from public, anon, authenticated;

alter table public.studio_master_references enable row level security;
drop policy if exists studio_master_references_select_own on public.studio_master_references;
create policy studio_master_references_select_own on public.studio_master_references
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.studio_master_references from anon, authenticated;
grant select on public.studio_master_references to authenticated;
grant select, insert, update, delete on public.studio_master_references to service_role;

-- 3) Master jobs: style + reference -----------------------------------------
alter table public.studio_master_jobs
  add column if not exists style text check (style is null or style in ('warm', 'bright', 'loud', 'dynamic')),
  add column if not exists style_intensity smallint not null default 0 check (style_intensity between 0 and 100),
  add column if not exists reference_id uuid references public.studio_master_references(id) on delete set null,
  add column if not exists reference_intensity smallint not null default 0 check (reference_intensity between 0 and 100);

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.studio_master_jobs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%stage%' and pg_get_constraintdef(oid) like '%queued%';
  if c is not null then execute format('alter table public.studio_master_jobs drop constraint %I', c); end if;
end $$;
alter table public.studio_master_jobs add constraint studio_master_jobs_stage_check
  check (stage is null or stage in ('queued', 'download', 'reference', 'decode', 'render', 'master', 'encode', 'upload', 'done'));

-- 4) Claim (quota) with style + reference -----------------------------------
drop function if exists public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer);
create or replace function public.claim_studio_master_job(
  p_job_id uuid,
  p_project_id uuid,
  p_owner_id uuid,
  p_target text,
  p_settings jsonb,
  p_source_document_version integer,
  p_month_limit integer,
  p_style text default null,
  p_style_intensity integer default 0,
  p_reference_id uuid default null,
  p_reference_intensity integer default 0)
returns table (allowed boolean, used integer, month_limit integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := public.studio_master_month_start(now());
  v_reset timestamptz := (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month') at time zone 'Europe/Warsaw';
  v_used integer;
begin
  if p_month_limit is null or p_month_limit < 0 then
    raise exception 'MASTER_LIMIT_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_projects where id = p_project_id and owner_id = p_owner_id) then
    raise exception 'MASTER_PROJECT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if p_reference_id is not null and not exists (
    select 1 from public.studio_master_references r
     where r.id = p_reference_id and r.owner_id = p_owner_id and r.project_id = p_project_id
       and r.status = 'ready' and r.expires_at > now()) then
    raise exception 'MASTER_REFERENCE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_master_month:' || p_owner_id::text, 0));
  select count(*) into v_used
    from public.studio_master_jobs
   where owner_id = p_owner_id and kind = 'master'
     and created_at >= v_start
     and status not in ('failed', 'cancelled');
  if v_used >= p_month_limit then
    return query select false, v_used, p_month_limit, v_reset;
    return;
  end if;
  insert into public.studio_master_jobs (id, project_id, owner_id, kind, target, settings, source_document_version, output_format,
                                         style, style_intensity, reference_id, reference_intensity)
  values (p_job_id, p_project_id, p_owner_id, 'master', p_target, coalesce(p_settings, '{}'::jsonb), p_source_document_version, 'WAV_FLOAT',
          p_style, case when p_style is null then 0 else coalesce(p_style_intensity, 0) end,
          p_reference_id, case when p_reference_id is null then 0 else coalesce(p_reference_intensity, 0) end);
  return query select true, v_used + 1, p_month_limit, v_reset;
end $$;

revoke all on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_studio_master_job(uuid, uuid, uuid, text, jsonb, integer, integer, text, integer, uuid, integer) to service_role;
