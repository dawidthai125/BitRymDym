-- Atomic plan caps for Studio projects and user samples (closes count-then-insert races, audit W4).
-- Same shape as 20261121120000_ai_usage_atomic_claims.sql: a per-owner advisory xact lock, count and
-- insert in one transaction. The cap is passed in by the app (SSOT = src/config/plan-policy.ts);
-- no limit numbers live in SQL.
-- * create_studio_project_capped: counts non-ARCHIVED projects, inserts a DRAFT project, returns the row.
-- * create_studio_sample_capped: counts all samples of the owner, inserts a PRIVATE sample, returns the row.
--   Lab columns (sample_type, bpm, musical_key, bars, source, beat_id) are written only when p_lab is given,
--   so their column defaults stay in one place.
-- Tracks per project are already atomic (studio_cas_add_track / studio_cas_duplicate_track lock the project).
-- SECURITY INVOKER: callers are service_role only (table grants + BYPASSRLS); no definer escalation.
-- Idempotent. Do not db push to production without the Owner apply process.

-- 1) Studio projects -----------------------------------------------------------
create or replace function public.create_studio_project_capped(
  p_owner uuid,
  p_max_projects integer,
  p_title text,
  p_tempo_bpm numeric,
  p_beat_id uuid,
  p_timeline_length_ms integer)
returns setof public.studio_projects
language plpgsql security invoker set search_path = public as $$
declare
  v_active integer;
begin
  if p_owner is null or p_max_projects is null or p_max_projects < 0 then
    raise exception 'PROJECT_LIMIT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_projects_cap:' || p_owner::text, 0));
  select count(*) into v_active
    from public.studio_projects p
   where p.owner_id = p_owner and p.status <> 'ARCHIVED';
  if v_active >= p_max_projects then
    raise exception 'PROJECT_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return query
    insert into public.studio_projects (owner_id, title, status, tempo_bpm, beat_id, timeline_length_ms)
    values (p_owner, p_title, 'DRAFT', p_tempo_bpm, p_beat_id, p_timeline_length_ms)
    returning *;
end;
$$;
revoke all on function public.create_studio_project_capped(uuid, integer, text, numeric, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_studio_project_capped(uuid, integer, text, numeric, uuid, integer) to service_role;

-- 2) User samples ------------------------------------------------------------------
create or replace function public.create_studio_sample_capped(
  p_owner uuid,
  p_cap integer,
  p_id uuid,
  p_title text,
  p_kind text,
  p_instrument text,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_duration_ms integer,
  p_lab jsonb default null)
returns setof public.studio_samples
language plpgsql security invoker set search_path = public as $$
declare
  v_owned integer;
begin
  if p_owner is null or p_id is null or p_cap is null or p_cap < 0 then
    raise exception 'SAMPLE_CAP_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_samples_cap:' || p_owner::text, 0));
  select count(*) into v_owned from public.studio_samples s where s.owner_id = p_owner;
  if v_owned >= p_cap then
    raise exception 'SAMPLE_CAP_REACHED' using errcode = 'P0001';
  end if;
  if p_lab is null then
    return query
      insert into public.studio_samples (
        id, owner_id, title, kind, instrument, status, rights_accepted,
        object_key, content_type, byte_size, duration_ms)
      values (
        p_id, p_owner, p_title, p_kind, p_instrument, 'PRIVATE', true,
        p_object_key, p_content_type, p_byte_size, p_duration_ms)
      returning *;
  else
    return query
      insert into public.studio_samples (
        id, owner_id, title, kind, instrument, status, rights_accepted,
        object_key, content_type, byte_size, duration_ms,
        sample_type, bpm, musical_key, bars, source, beat_id)
      values (
        p_id, p_owner, p_title, p_kind, p_instrument, 'PRIVATE', true,
        p_object_key, p_content_type, p_byte_size, p_duration_ms,
        p_lab->>'sample_type', (p_lab->>'bpm')::numeric, p_lab->>'musical_key',
        (p_lab->>'bars')::smallint, p_lab->>'source', (p_lab->>'beat_id')::uuid)
      returning *;
  end if;
end;
$$;
revoke all on function public.create_studio_sample_capped(uuid, integer, uuid, text, text, text, text, text, bigint, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_studio_sample_capped(uuid, integer, uuid, text, text, text, text, text, bigint, integer, jsonb) to service_role;
