-- Studio stems (Silver 8 / Gold 16 per project): imported audio files placed as tracks.
-- A stem is a normal take (so it plays, mixes and masters like a vocal) marked is_stem:
--   * it does NOT count toward the daily recording sessions or the active-READY cap,
--   * it belongs to one project (stem_project_id; deleting the project deletes its stems),
--   * it may be up to 240 s (vocal takes stay at 180 s),
--   * it is claimed by its own function (claim_stem_take_session) with a per-project cap.
-- Additive: existing rows get is_stem = false and nothing else changes.

alter table public.takes add column if not exists is_stem boolean not null default false;
alter table public.takes add column if not exists stem_project_id uuid references public.studio_projects (id) on delete cascade;

alter table public.takes drop constraint if exists takes_stem_project_chk;
alter table public.takes add constraint takes_stem_project_chk
  check ((is_stem and stem_project_id is not null) or (not is_stem and stem_project_id is null));

alter table public.takes drop constraint if exists takes_duration_range_chk;
alter table public.takes add constraint takes_duration_range_chk
  check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= case when is_stem then 240 else 180 end));

alter table public.takes drop constraint if exists takes_recording_max_snapshot_chk;
alter table public.takes add constraint takes_recording_max_snapshot_chk
  check (recording_max_seconds_snapshot > 0 and recording_max_seconds_snapshot <= case when is_stem then 240 else 180 end);

-- One pending upload per owner stays true for vocals; stems may upload in parallel.
drop index if exists public.takes_one_pending_per_owner_uidx;
create unique index takes_one_pending_per_owner_uidx
  on public.takes (owner_id)
  where status = 'PENDING_UPLOAD' and owner_id is not null and deleted_at is null and not is_stem;

create index if not exists takes_stem_project_idx
  on public.takes (stem_project_id, status)
  where is_stem and deleted_at is null;

-- Same function as before, but stems no longer count toward the vocal limits.
create or replace function public.claim_take_recording_session(
  p_owner_id uuid,
  p_beat_id uuid,
  p_take_id uuid,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_recording_mode public.take_recording_mode,
  p_beat_duration_seconds integer,
  p_recording_max_seconds integer,
  p_beat_bpm integer,
  p_expires_at timestamptz,
  p_max_active_ready integer,
  p_max_sessions_utc_day integer,
  p_replace_take_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_active_ready integer;
  v_sessions_today integer;
  v_utc_day_start timestamptz;
  v_replace public.takes%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim take recording sessions'
      using errcode = '42501';
  end if;

  if p_owner_id is null or p_beat_id is null or p_take_id is null then
    raise exception 'owner_id, beat_id and take_id are required';
  end if;

  if p_max_active_ready is null or p_max_active_ready < 0 then
    raise exception 'Invalid max_active_ready';
  end if;

  if p_max_sessions_utc_day is null or p_max_sessions_utc_day < 1 then
    raise exception 'Invalid max_sessions_utc_day';
  end if;

  if p_replace_take_id is not null and p_replace_take_id = p_take_id then
    raise exception 'REPLACE_INVALID'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  if p_replace_take_id is not null then
    select * into v_replace
    from public.takes t
    where t.id = p_replace_take_id
    for update;

    if not found then
      raise exception 'REPLACE_INVALID'
        using errcode = 'P0001';
    end if;

    if v_replace.owner_id is distinct from p_owner_id then
      raise exception 'REPLACE_OWNERSHIP_DENIED'
        using errcode = 'P0001';
    end if;

    if v_replace.deleted_at is not null or v_replace.status = 'DELETED' then
      raise exception 'REPLACE_INVALID'
        using errcode = 'P0001';
    end if;

    if v_replace.status is distinct from 'READY' then
      raise exception 'REPLACE_NOT_READY'
        using errcode = 'P0001';
    end if;

    if v_replace.expires_at <= now() then
      raise exception 'REPLACE_EXPIRED'
        using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer into v_active_ready
  from public.takes t
  where t.owner_id = p_owner_id
    and not t.is_stem
    and t.status = 'READY'
    and t.deleted_at is null
    and t.expires_at > now();

  if p_replace_take_id is null then
    if v_active_ready >= p_max_active_ready then
      raise exception 'REPLACE_REQUIRED'
        using errcode = 'P0001';
    end if;
  else
    -- Valid replace reserves one slot: allow claim at/above prior DENY threshold.
    -- Still refuse pathological overshoot (active without counting reserved target).
    if (v_active_ready - 1) >= p_max_active_ready then
      raise exception 'REPLACE_REQUIRED'
        using errcode = 'P0001';
    end if;
  end if;

  v_utc_day_start := date_trunc('day', timezone('utc', now()));

  select count(*)::integer into v_sessions_today
  from public.takes t
  where t.owner_id = p_owner_id
    and not t.is_stem
    and t.created_at >= v_utc_day_start
    and t.created_at < v_utc_day_start + interval '1 day';

  if v_sessions_today >= p_max_sessions_utc_day then
    if not public.consume_studio_quota_credit(p_owner_id, 'take') then
      raise exception 'SESSION_DAY_CAP'
        using errcode = 'P0001';
    end if;
  end if;

  -- STU-16: release the actor's own stale reservation (window elapsed, no
  -- object). Rolled back with the claim if anything below fails.
  update public.takes t
  set status = 'FAILED',
      failure_reason = 'PENDING_UPLOAD_WINDOW_ELAPSED'
  where t.owner_id = p_owner_id
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

  begin
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
      replaces_take_id
    ) values (
      p_take_id,
      p_owner_id,
      null,
      p_beat_id,
      'PENDING_UPLOAD',
      p_recording_mode,
      'take-audio',
      p_object_key,
      p_content_type,
      p_byte_size,
      p_beat_duration_seconds,
      p_recording_max_seconds,
      p_beat_bpm,
      0,
      p_expires_at,
      p_replace_take_id
    );
  exception
    when unique_violation then
      if sqlerrm ilike '%takes_one_pending_replace_target%'
         or sqlerrm ilike '%replaces_take_id%' then
        raise exception 'REPLACE_CONFLICT'
          using errcode = 'P0001';
      end if;
      raise exception 'CONCURRENT_SESSION'
        using errcode = 'P0001';
  end;

  return p_take_id;
end;
$function$;

revoke all on function public.claim_take_recording_session(uuid, uuid, uuid, text, text, bigint, public.take_recording_mode, integer, integer, integer, timestamptz, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_take_recording_session(uuid, uuid, uuid, text, text, bigint, public.take_recording_mode, integer, integer, integer, timestamptz, integer, integer, uuid) to service_role;

-- Claim one stem upload. Own project only; per-project cap (p_max_stems) and a per-user cap
-- (p_max_user_stems) bound storage. Returns the take id; errors: STEM_PROJECT_INVALID,
-- STEM_PROJECT_CAP, STEM_USER_CAP.
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

  if p_owner_id is null or p_project_id is null or p_beat_id is null or p_take_id is null then
    raise exception 'owner_id, project_id, beat_id and take_id are required';
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

-- Stems are up to 48 MB (a 4-minute 44.1 kHz 16-bit stereo WAV is ~42 MB). The app still caps
-- vocal takes at 20 MB (TAKE_AUDIO_MAX_BYTES); only the bucket limit moves. The project-wide
-- Supabase upload limit still applies on top of this.
update storage.buckets set file_size_limit = 52428800 where id = 'take-audio';
