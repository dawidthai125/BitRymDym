-- Blocked audio (owner order 2026-11-26): a file taken down from the catalogue stays blocked everywhere.
--
-- blocked_audio_fingerprints: one row per taken-down file. sha256 = exact copy; fingerprint = Chromaprint
--   raw (chromaprint-raw-v1, same as beat_audio_fingerprints), filled at once when we already have it
--   (beat / sample fingerprints) or by the upload-screen worker on the E3 host (status pending -> ready).
-- upload_block_events: moderation log of every refused upload (exact copy or acoustic match).
-- takes.sha256 / screen_status: every new take or stem is screened. finalize checks the SHA-256 before
--   the take becomes READY; the worker then compares the acoustic fingerprint (pending -> passed/blocked).
--   NULL screen_status = take from before this migration (not screened, treated as passed).
-- Processing gate: a master / mix / cleanup job cannot be queued while a file of the project waits for
--   the screen or was blocked (UPLOAD_SCREENING_PENDING / UPLOAD_BLOCKED).
-- block_audio_source(): takedown entry point (staff actions) + backfill of everything taken down before.
-- All objects: service_role only (RLS on, no grants to anon / authenticated).

-- 1) blocklist --------------------------------------------------------------------------------

create table if not exists public.blocked_audio_fingerprints (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id uuid not null,
  storage_bucket text,
  object_key text,
  sha256 text,
  algorithm text not null default 'chromaprint-raw-v1',
  fingerprint integer[],
  duration_seconds numeric,
  status text not null default 'pending',
  error_code text,
  attempts smallint not null default 0,
  claimed_at timestamptz,
  reason text not null,
  report_id uuid references public.content_reports (id) on delete set null,
  -- No FK (same reason as catalog_works.staff_by): deleting a staff account must not touch the list.
  blocked_by uuid,
  blocked_at timestamptz not null default now(),
  fingerprinted_at timestamptz,
  constraint blocked_audio_kind_chk check (source_kind in ('work_master', 'work_upload', 'beat', 'sample')),
  constraint blocked_audio_status_chk check (status in ('pending', 'ready', 'error')),
  constraint blocked_audio_sha_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint blocked_audio_fp_chk check (fingerprint is null or cardinality(fingerprint) > 0),
  constraint blocked_audio_ready_chk check (status <> 'ready' or fingerprint is not null or sha256 is not null),
  constraint blocked_audio_reason_chk check (char_length(reason) between 1 and 500),
  constraint blocked_audio_error_chk check (error_code is null or char_length(error_code) <= 80),
  constraint blocked_audio_bucket_chk check (storage_bucket is null or storage_bucket in ('audio-artifacts', 'beat-audio', 'take-audio')),
  constraint blocked_audio_key_chk check (object_key is null or (char_length(object_key) between 1 and 512 and position('..' in object_key) = 0))
);

create unique index if not exists blocked_audio_source_uq
  on public.blocked_audio_fingerprints (source_kind, source_id, coalesce(object_key, ''));
create index if not exists blocked_audio_sha_idx on public.blocked_audio_fingerprints (sha256) where sha256 is not null;
create index if not exists blocked_audio_pending_idx on public.blocked_audio_fingerprints (blocked_at) where status = 'pending';
create index if not exists blocked_audio_report_idx on public.blocked_audio_fingerprints (report_id) where report_id is not null;

alter table public.blocked_audio_fingerprints enable row level security;
alter table public.blocked_audio_fingerprints force row level security;
revoke all on table public.blocked_audio_fingerprints from public, anon, authenticated;
grant select, insert, update, delete on table public.blocked_audio_fingerprints to service_role;
drop policy if exists blocked_audio_service_all on public.blocked_audio_fingerprints;
create policy blocked_audio_service_all on public.blocked_audio_fingerprints
  for all to service_role using (true) with check (true);

comment on table public.blocked_audio_fingerprints is
  'Files taken down from the catalogue (works, beats, samples). Every new upload is compared with it: SHA-256 at finalize, Chromaprint on the E3 upload-screen worker. service_role only.';

-- 2) moderation log -----------------------------------------------------------------------------

create table if not exists public.upload_block_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  owner_id uuid,
  take_id uuid,
  upload_kind text not null,
  match_kind text not null,
  blocked_id uuid references public.blocked_audio_fingerprints (id) on delete set null,
  catalog_beat_id uuid,
  score numeric,
  matched_seconds numeric,
  sha256 text,
  constraint upload_block_events_kind_chk check (upload_kind in ('take', 'stem', 'anon_take', 'beat', 'sample')),
  constraint upload_block_events_match_chk check (match_kind in ('blocked_sha256', 'blocked_fingerprint', 'catalog_sha256', 'catalog_fingerprint')),
  constraint upload_block_events_sha_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);
create index if not exists upload_block_events_created_idx on public.upload_block_events (created_at desc);
create index if not exists upload_block_events_owner_idx on public.upload_block_events (owner_id) where owner_id is not null;
create index if not exists upload_block_events_blocked_idx on public.upload_block_events (blocked_id) where blocked_id is not null;

alter table public.upload_block_events enable row level security;
alter table public.upload_block_events force row level security;
revoke all on table public.upload_block_events from public, anon, authenticated;
grant select, insert on table public.upload_block_events to service_role;
grant usage on sequence public.upload_block_events_id_seq to service_role;
drop policy if exists upload_block_events_service_all on public.upload_block_events;
create policy upload_block_events_service_all on public.upload_block_events
  for all to service_role using (true) with check (true);

comment on table public.upload_block_events is
  'Moderation log: uploads refused because they match a taken-down file or a catalogue beat. Append only, service_role.';

-- 3) takes screening ------------------------------------------------------------------------------

alter table public.takes
  add column if not exists sha256 text,
  add column if not exists screen_status text,
  add column if not exists screen_attempts smallint not null default 0,
  add column if not exists screen_claimed_at timestamptz,
  add column if not exists screened_at timestamptz;

alter table public.takes drop constraint if exists takes_screen_status_chk;
alter table public.takes add constraint takes_screen_status_chk
  check (screen_status is null or screen_status in ('pending', 'passed', 'blocked', 'error'));
alter table public.takes drop constraint if exists takes_sha256_chk;
alter table public.takes add constraint takes_sha256_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

create index if not exists takes_screen_pending_idx on public.takes (created_at) where screen_status = 'pending';

comment on column public.takes.screen_status is
  'Upload screen vs blocked_audio_fingerprints + catalogue beats. pending: SHA-256 passed at finalize, acoustic check on the E3 worker. blocked: refused, object removed. error: the worker failed 3 times (processing stays blocked). NULL: before 2026-11-26.';

-- 4) exact copy check at finalize (before READY) ----------------------------------------------------

-- Returns the first match or no row. Logs the event. A catalogue beat matches unless it is the project
-- beat (stems), the take's own beat is never an allowed upload, and the uploader's own beats are allowed.
create or replace function public.check_upload_sha256(
  p_sha256 text, p_upload_kind text, p_owner_id uuid, p_take_id uuid, p_allowed_beat_id uuid)
returns table (match_kind text, blocked_id uuid, catalog_beat_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_blocked uuid;
  v_beat uuid;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'UPLOAD_SHA_INVALID' using errcode = '22023';
  end if;

  select b.id into v_blocked
    from public.blocked_audio_fingerprints b
   where b.sha256 = p_sha256
   order by b.blocked_at
   limit 1;
  if v_blocked is not null then
    insert into public.upload_block_events (owner_id, take_id, upload_kind, match_kind, blocked_id, sha256)
    values (p_owner_id, p_take_id, p_upload_kind, 'blocked_sha256', v_blocked, p_sha256);
    return query select 'blocked_sha256'::text, v_blocked, null::uuid;
    return;
  end if;

  select a.beat_id into v_beat
    from public.beat_audio_assets a
    join public.beats bt on bt.id = a.beat_id
   where a.checksum_sha256 = p_sha256
     and bt.status in ('APPROVED', 'PUBLISHED')
     and (p_allowed_beat_id is null or a.beat_id <> p_allowed_beat_id)
     and (p_owner_id is null or bt.owner_id is distinct from p_owner_id)
   limit 1;
  if v_beat is not null then
    insert into public.upload_block_events (owner_id, take_id, upload_kind, match_kind, catalog_beat_id, sha256)
    values (p_owner_id, p_take_id, p_upload_kind, 'catalog_sha256', v_beat, p_sha256);
    return query select 'catalog_sha256'::text, null::uuid, v_beat;
  end if;
end;
$$;
revoke all on function public.check_upload_sha256(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_upload_sha256(text, text, uuid, uuid, uuid) to service_role;

-- 5) worker: acoustic screen of new takes ----------------------------------------------------------

create or replace function public.claim_next_upload_screening(p_worker_ref text)
returns table (take_id uuid, owner_id uuid, storage_bucket text, object_key text, beat_id uuid, stem_project_id uuid, is_stem boolean, sha256 text, project_beat_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select t.id into v_id
    from public.takes t
   where t.screen_status = 'pending'
     and (t.screen_claimed_at is null or t.screen_claimed_at < now() - interval '5 minutes')
   order by t.created_at
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;
  update public.takes t
     set screen_claimed_at = now(), screen_attempts = t.screen_attempts + 1
   where t.id = v_id;
  return query
    select t.id, t.owner_id, t.storage_bucket, t.object_key, t.beat_id, t.stem_project_id, coalesce(t.is_stem, false), t.sha256,
           (select p.beat_id from public.studio_projects p where p.id = t.stem_project_id)
      from public.takes t
     where t.id = v_id;
end;
$$;
revoke all on function public.claim_next_upload_screening(text) from public, anon, authenticated;
grant execute on function public.claim_next_upload_screening(text) to service_role;

-- p_outcome: passed | blocked | error. blocked: the take is deleted (the worker removes the object) and logged.
-- error: retried up to 3 claims, then screen_status = error (fails closed for processing).
create or replace function public.complete_upload_screening(
  p_take_id uuid, p_outcome text, p_match_kind text default null, p_blocked_id uuid default null,
  p_catalog_beat_id uuid default null, p_score numeric default null, p_matched_seconds numeric default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_take public.takes;
  v_status text;
begin
  select * into v_take from public.takes t where t.id = p_take_id for update;
  if not found or v_take.screen_status is distinct from 'pending' then
    return 'stale';
  end if;
  if p_outcome = 'passed' then
    update public.takes t set screen_status = 'passed', screened_at = now(), screen_claimed_at = null where t.id = p_take_id;
    return 'passed';
  elsif p_outcome = 'blocked' then
    if p_match_kind not in ('blocked_fingerprint', 'catalog_fingerprint', 'blocked_sha256', 'catalog_sha256') then
      raise exception 'UPLOAD_SCREEN_BAD_MATCH' using errcode = '22023';
    end if;
    update public.takes t
       set screen_status = 'blocked', screened_at = now(), screen_claimed_at = null,
           status = 'DELETED', deleted_at = coalesce(t.deleted_at, now()), failure_reason = 'BLOCKED_AUDIO'
     where t.id = p_take_id;
    insert into public.upload_block_events (owner_id, take_id, upload_kind, match_kind, blocked_id, catalog_beat_id, score, matched_seconds, sha256)
    values (v_take.owner_id, p_take_id,
            case when coalesce(v_take.is_stem, false) then 'stem' when v_take.owner_id is null then 'anon_take' else 'take' end,
            p_match_kind, p_blocked_id, p_catalog_beat_id, p_score, p_matched_seconds, v_take.sha256);
    return 'blocked';
  elsif p_outcome = 'error' then
    v_status := case when v_take.screen_attempts >= 3 then 'error' else 'pending' end;
    update public.takes t
       set screen_status = v_status, screened_at = case when v_status = 'error' then now() else null end,
           screen_claimed_at = case when v_status = 'error' then null else t.screen_claimed_at end
     where t.id = p_take_id;
    return v_status;
  end if;
  raise exception 'UPLOAD_SCREEN_BAD_OUTCOME' using errcode = '22023';
end;
$$;
revoke all on function public.complete_upload_screening(uuid, text, text, uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.complete_upload_screening(uuid, text, text, uuid, uuid, numeric, numeric) to service_role;

-- The worker records that it removed the object of a blocked take.
create or replace function public.mark_blocked_take_object_removed(p_take_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.takes set object_removed_at = coalesce(object_removed_at, now())
   where id = p_take_id and screen_status = 'blocked';
$$;
revoke all on function public.mark_blocked_take_object_removed(uuid) from public, anon, authenticated;
grant execute on function public.mark_blocked_take_object_removed(uuid) to service_role;

-- 6) worker: fill fingerprints of taken-down files -------------------------------------------------

create or replace function public.claim_next_blocked_fingerprint()
returns table (id uuid, source_kind text, storage_bucket text, object_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select b.id into v_id
    from public.blocked_audio_fingerprints b
   where b.status = 'pending' and b.object_key is not null
     and (b.claimed_at is null or b.claimed_at < now() - interval '10 minutes')
   order by b.blocked_at
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;
  update public.blocked_audio_fingerprints b set claimed_at = now(), attempts = b.attempts + 1 where b.id = v_id;
  return query select b.id, b.source_kind, b.storage_bucket, b.object_key from public.blocked_audio_fingerprints b where b.id = v_id;
end;
$$;
revoke all on function public.claim_next_blocked_fingerprint() from public, anon, authenticated;
grant execute on function public.claim_next_blocked_fingerprint() to service_role;

create or replace function public.complete_blocked_fingerprint(
  p_id uuid, p_sha256 text, p_fingerprint integer[], p_duration numeric, p_error text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_attempts smallint;
begin
  select b.attempts into v_attempts from public.blocked_audio_fingerprints b where b.id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if p_error is null then
    update public.blocked_audio_fingerprints b
       set sha256 = coalesce(p_sha256, b.sha256), fingerprint = coalesce(p_fingerprint, b.fingerprint),
           duration_seconds = coalesce(p_duration, b.duration_seconds), status = 'ready', error_code = null,
           fingerprinted_at = now(), claimed_at = null
     where b.id = p_id;
    return 'ready';
  end if;
  update public.blocked_audio_fingerprints b
     set sha256 = coalesce(p_sha256, b.sha256), error_code = left(p_error, 80), claimed_at = null,
         -- A row with a SHA-256 still blocks exact copies even when the fingerprint failed.
         status = case when v_attempts >= 3 then (case when coalesce(p_sha256, b.sha256) is not null then 'ready' else 'error' end) else 'pending' end
   where b.id = p_id;
  return 'error';
end;
$$;
revoke all on function public.complete_blocked_fingerprint(uuid, text, integer[], numeric, text) from public, anon, authenticated;
grant execute on function public.complete_blocked_fingerprint(uuid, text, integer[], numeric, text) to service_role;

-- 7) takedown entry point ----------------------------------------------------------------------------

-- p_kind: work | beat | sample. Idempotent (unique source index). Returns the number of rows added.
-- work: the approved master of the work + every stem / imported file of its project.
-- beat: its active MASTER (SHA-256 from the asset, fingerprint copied when the beat was fingerprinted).
-- sample: its file (fingerprint copied when the sample was fingerprinted).
create or replace function public.block_audio_source(
  p_kind text, p_source_id uuid, p_reason text, p_report_id uuid default null, p_actor uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Zdjęte z katalogu.'), 500);
  v_count integer := 0;
  v_n integer;
  v_work record;
begin
  if p_kind = 'work' then
    select w.id, w.project_id, w.owner_id, j.result_object_key
      into v_work
      from public.catalog_works w
      join public.studio_master_jobs j on j.id = w.master_job_id
     where w.id = p_source_id;
    if not found then
      raise exception 'BLOCK_SOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_work.result_object_key is not null then
      insert into public.blocked_audio_fingerprints (source_kind, source_id, storage_bucket, object_key, reason, report_id, blocked_by)
      values ('work_master', p_source_id, 'audio-artifacts', v_work.result_object_key, v_reason, p_report_id, p_actor)
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
    end if;
    -- Uploaded files of the project: stems (also "Sam mastering") and imported vocals used on its tracks.
    insert into public.blocked_audio_fingerprints (source_kind, source_id, storage_bucket, object_key, sha256, reason, report_id, blocked_by)
    select 'work_upload', p_source_id, t.storage_bucket, t.object_key, t.sha256, v_reason, p_report_id, p_actor
      from public.takes t
     where t.owner_id = v_work.owner_id
       and t.object_removed_at is null
       and (
         t.stem_project_id = v_work.project_id
         or (t.rights_confirmed_at is not null and t.id in (
               select c.source_take_id
                 from public.studio_clips c
                 join public.studio_tracks tr on tr.id = c.track_id
                where tr.project_id = v_work.project_id and c.source_take_id is not null))
       )
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;

  elsif p_kind = 'beat' then
    insert into public.blocked_audio_fingerprints (
      source_kind, source_id, storage_bucket, object_key, sha256, fingerprint, duration_seconds, status, fingerprinted_at, reason, report_id, blocked_by)
    select 'beat', p_source_id, a.storage_bucket, a.object_key,
           case when a.checksum_sha256 ~ '^[0-9a-f]{64}$' then a.checksum_sha256 end,
           f.fingerprint, f.duration_seconds,
           case when f.fingerprint is not null then 'ready' else 'pending' end,
           case when f.fingerprint is not null then now() end,
           v_reason, p_report_id, p_actor
      from public.beat_audio_assets a
      left join lateral (
        select x.fingerprint, x.duration_seconds from public.beat_audio_fingerprints x
         where x.master_asset_id = a.id and x.algorithm = 'chromaprint-raw-v1' limit 1) f on true
     where a.beat_id = p_source_id and a.purpose = 'MASTER' and a.is_active
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;

  elsif p_kind = 'sample' then
    insert into public.blocked_audio_fingerprints (
      source_kind, source_id, storage_bucket, object_key, fingerprint, duration_seconds, status, fingerprinted_at, reason, report_id, blocked_by)
    select 'sample', p_source_id, 'beat-audio', s.object_key,
           f.fingerprint, f.duration_seconds,
           case when f.fingerprint is not null then 'ready' else 'pending' end,
           case when f.fingerprint is not null then now() end,
           v_reason, p_report_id, p_actor
      from public.studio_samples s
      left join lateral (
        select x.fingerprint, x.duration_seconds from public.sample_audio_fingerprints x
         where x.sample_id = s.id and x.algorithm = 'chromaprint-raw-v1' order by x.created_at desc limit 1) f on true
     where s.id = p_source_id and s.object_key is not null
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  else
    raise exception 'BLOCK_SOURCE_KIND' using errcode = '22023';
  end if;
  return v_count;
end;
$$;
revoke all on function public.block_audio_source(text, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.block_audio_source(text, uuid, text, uuid, uuid) to service_role;

-- 8) processing gate -----------------------------------------------------------------------------------

create or replace function public.upload_screen_gate_project(p_project_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_blocked boolean;
  v_pending boolean;
begin
  select bool_or(t.screen_status in ('blocked', 'error')), bool_or(t.screen_status = 'pending')
    into v_blocked, v_pending
    from public.takes t
   where t.screen_status in ('pending', 'blocked', 'error')
     and (
       -- stems of the project (a blocked stem is deleted; it still blocks while a clip uses it, below)
       (t.stem_project_id = p_project_id and t.status <> 'DELETED')
       or t.id in (
         select c.source_take_id
           from public.studio_clips c
           join public.studio_tracks tr on tr.id = c.track_id
          where tr.project_id = p_project_id and c.source_take_id is not null)
     );
  if coalesce(v_blocked, false) then
    raise exception 'UPLOAD_BLOCKED' using errcode = 'P0001';
  elsif coalesce(v_pending, false) then
    raise exception 'UPLOAD_SCREENING_PENDING' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.upload_screen_gate_project(uuid) from public, anon, authenticated;
grant execute on function public.upload_screen_gate_project(uuid) to service_role;

create or replace function public.studio_master_jobs_upload_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.upload_screen_gate_project(new.project_id);
  return new;
end;
$$;
revoke all on function public.studio_master_jobs_upload_gate() from public, anon, authenticated;
drop trigger if exists studio_master_jobs_upload_gate_trg on public.studio_master_jobs;
create trigger studio_master_jobs_upload_gate_trg
  before insert on public.studio_master_jobs
  for each row execute function public.studio_master_jobs_upload_gate();

create or replace function public.studio_cleanup_jobs_upload_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_state text;
begin
  select t.screen_status into v_state from public.takes t where t.id = new.take_id;
  if v_state in ('blocked', 'error') then
    raise exception 'UPLOAD_BLOCKED' using errcode = 'P0001';
  elsif v_state = 'pending' then
    raise exception 'UPLOAD_SCREENING_PENDING' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.studio_cleanup_jobs_upload_gate() from public, anon, authenticated;
drop trigger if exists studio_cleanup_jobs_upload_gate_trg on public.studio_cleanup_jobs;
create trigger studio_cleanup_jobs_upload_gate_trg
  before insert on public.studio_cleanup_jobs
  for each row execute function public.studio_cleanup_jobs_upload_gate();

-- 9) backfill: everything taken down before this migration -----------------------------------------

do $$
declare
  r record;
begin
  for r in
    select w.id, w.staff_note, w.staff_by
      from public.catalog_works w
     where w.check_status in ('rejected', 'removed')
  loop
    perform public.block_audio_source('work', r.id, coalesce(r.staff_note, 'Zdjęte z katalogu przed 2026-11-26 (uzupełnienie listy blokad).'), null, r.staff_by);
  end loop;

  for r in
    select c.id, c.target_kind, c.target_id, c.staff_note, c.handled_by
      from public.content_reports c
     where c.status = 'removed'
  loop
    begin
      perform public.block_audio_source(r.target_kind, r.target_id, coalesce(r.staff_note, 'Zdjęte po zgłoszeniu naruszenia praw.'), r.id, r.handled_by);
    exception when sqlstate 'P0002' then
      null; -- the reported work no longer exists
    end;
  end loop;
end;
$$;
