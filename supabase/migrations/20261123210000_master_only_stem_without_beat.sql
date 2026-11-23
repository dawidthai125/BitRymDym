-- /mastering ("Sam mastering"): a finished mix is uploaded as a stem of a project that has no beat.
-- Until now every take needed a beat, so the upload could never start.
--   * a stem (and only a stem) may have beat_id null; vocal takes keep the old rule,
--   * claim_stem_take_session accepts a null beat only for a project without a beat,
--   * per-project and per-user stem caps, ownership and grants are unchanged.
-- Additive: no existing row changes. Not applied by the agent who wrote it.

alter table public.takes alter column beat_id drop not null;

alter table public.takes drop constraint if exists takes_beat_required_chk;
alter table public.takes add constraint takes_beat_required_chk
  check (beat_id is not null or is_stem);

create or replace function public.claim_stem_take_session(
  p_owner_id uuid,
  p_project_id uuid,
  p_beat_id uuid,
  p_take_id uuid,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_beat_duration_seconds integer,
  p_beat_bpm integer,
  p_expires_at timestamptz,
  p_max_stems integer,
  p_max_user_stems integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project_stems integer;
  v_user_stems integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim stem sessions'
      using errcode = '42501';
  end if;

  if p_owner_id is null or p_project_id is null or p_take_id is null then
    raise exception 'owner_id, project_id and take_id are required';
  end if;

  if p_max_stems is null or p_max_stems < 1 or p_max_stems > 64
     or p_max_user_stems is null or p_max_user_stems < p_max_stems then
    raise exception 'Invalid stem caps';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 1));

  if not exists (
    select 1 from public.studio_projects sp
    where sp.id = p_project_id and sp.owner_id = p_owner_id
  ) then
    raise exception 'STEM_PROJECT_INVALID' using errcode = 'P0001';
  end if;

  -- No beat only for a project that has none ("Sam mastering"): a beat project's stem always names its beat.
  if p_beat_id is null and exists (
    select 1 from public.studio_projects sp
    where sp.id = p_project_id and sp.beat_id is not null
  ) then
    raise exception 'STEM_PROJECT_INVALID' using errcode = 'P0001';
  end if;

  -- Release this owner's stale stem reservations (window elapsed, no object).
  update public.takes t
  set status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  where t.owner_id = p_owner_id
    and t.is_stem
    and t.status = 'PENDING_UPLOAD'
    and t.deleted_at is null
    and t.created_at <= now()
      - make_interval(secs => public.take_pending_upload_window_seconds())
    and not exists (
      select 1
      from storage.objects o
      where o.bucket_id = t.storage_bucket
        and o.name = t.object_key
    );

  select count(*)::integer into v_project_stems
  from public.takes t
  where t.stem_project_id = p_project_id
    and t.is_stem
    and t.deleted_at is null
    and t.status in ('PENDING_UPLOAD', 'READY')
    and t.expires_at > now();

  if v_project_stems >= p_max_stems then
    raise exception 'STEM_PROJECT_CAP' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_user_stems
  from public.takes t
  where t.owner_id = p_owner_id
    and t.is_stem
    and t.deleted_at is null
    and t.status in ('PENDING_UPLOAD', 'READY')
    and t.expires_at > now();

  if v_user_stems >= p_max_user_stems then
    raise exception 'STEM_USER_CAP' using errcode = 'P0001';
  end if;

  insert into public.takes (
    id,
    owner_id,
    anonymous_token_hash,
    beat_id,
    status,
    recording_mode,
    storage_bucket,
    object_key,
    content_type,
    byte_size,
    beat_duration_seconds_snapshot,
    recording_max_seconds_snapshot,
    beat_bpm_snapshot,
    audio_offset_ms,
    expires_at,
    is_stem,
    stem_project_id
  ) values (
    p_take_id,
    p_owner_id,
    null,
    p_beat_id,
    'PENDING_UPLOAD',
    'FULL',
    'take-audio',
    p_object_key,
    p_content_type,
    p_byte_size,
    greatest(1, p_beat_duration_seconds),
    240,
    p_beat_bpm,
    0,
    p_expires_at,
    true,
    p_project_id
  );

  return p_take_id;
end;
$function$;

revoke all on function public.claim_stem_take_session(uuid, uuid, uuid, uuid, text, text, bigint, integer, integer, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_stem_take_session(uuid, uuid, uuid, uuid, text, text, bigint, integer, integer, timestamptz, integer, integer) to service_role;
