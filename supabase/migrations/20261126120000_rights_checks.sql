-- Rights checks (owner decision 2026-11-26):
-- 1) Sample fingerprints (catalogue samples + samples waiting for review).
-- 2) Catalogue works are checked before they go live: fingerprints of the master and of every
--    uploaded file in the project vs our beats + AcoustID. Match or error -> held for a moderator.
-- 3) Infringement reports from anyone (works, beats, samples) + staff withdraw.
-- Beat fingerprints already live in beat_audio_fingerprints; the auto-check poller now also
-- fingerprints every APPROVED/PUBLISHED beat (also platform beats published from "Oczekujące").

-- 1) sample fingerprints -----------------------------------------------------------------

create table if not exists public.sample_audio_fingerprints (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.studio_samples (id) on delete cascade,
  object_key text not null,
  algorithm text not null default 'chromaprint-raw-v1',
  duration_seconds numeric not null,
  fingerprint integer[] not null,
  -- Matches found when the sample was fingerprinted (beats, other samples, AcoustID). Staff hint only.
  matches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint sample_audio_fingerprints_nonempty_chk check (cardinality(fingerprint) > 0),
  constraint sample_audio_fingerprints_key_uq unique (object_key, algorithm)
);

create index if not exists sample_audio_fingerprints_sample_idx on public.sample_audio_fingerprints (sample_id);

alter table public.sample_audio_fingerprints enable row level security;
alter table public.sample_audio_fingerprints force row level security;
revoke all on table public.sample_audio_fingerprints from public, anon, authenticated;
grant select, insert, update, delete on table public.sample_audio_fingerprints to service_role;
drop policy if exists sample_audio_fingerprints_service_all on public.sample_audio_fingerprints;
create policy sample_audio_fingerprints_service_all on public.sample_audio_fingerprints
  for all to service_role using (true) with check (true);

-- 2) catalogue work check ---------------------------------------------------------------

alter table public.catalog_works
  add column if not exists check_status text not null default 'passed',
  add column if not exists check_requested_at timestamptz,
  add column if not exists check_claimed_at timestamptz,
  add column if not exists check_worker_ref text,
  add column if not exists check_attempts smallint not null default 0,
  add column if not exists checked_at timestamptz,
  add column if not exists check_result jsonb,
  add column if not exists check_summary text,
  add column if not exists rights_accepted_at timestamptz,
  add column if not exists staff_note text,
  -- No FK: a cascade from auth.users would run an UPDATE under the guard (auth.role() null) and fail deleteUser.
  add column if not exists staff_by uuid,
  -- Owner asked to take the project's earlier public version down when this one goes live.
  add column if not exists withdraw_older boolean not null default false,
  add column if not exists staff_at timestamptz;

alter table public.catalog_works drop constraint if exists catalog_works_check_status_chk;
alter table public.catalog_works
  add constraint catalog_works_check_status_chk
  check (check_status in ('pending', 'running', 'passed', 'held', 'rejected', 'cancelled', 'removed'));

create index if not exists catalog_works_check_queue_idx
  on public.catalog_works (check_requested_at)
  where check_status in ('pending', 'running');


comment on column public.catalog_works.check_status is
  'pending/running: waits for the rights check (hidden: withdrawn_at set). passed: live allowed. held: match or error, waits for staff. rejected/removed: staff took it down, owner cannot republish this master. cancelled: owner withdrew while waiting.';

-- Guard = 20261123190000 version (master checked only when it matters, a track can always be withdrawn)
-- plus: live only after the rights check passed; a waiting work keeps the owner's ranking choice.
create or replace function public.catalog_works_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  new.title := btrim(regexp_replace(new.title, '[[:space:]]+', ' ', 'g'));

  if tg_op = 'INSERT' or new.withdrawn_at is null
     or new.owner_id is distinct from old.owner_id
     or new.project_id is distinct from old.project_id
     or new.master_job_id is distinct from old.master_job_id then
    select exists (
      select 1
      from public.studio_master_jobs j
      where j.id = new.master_job_id
        and j.project_id = new.project_id
        and j.owner_id = new.owner_id
        and j.kind = 'master'
        and j.status = 'succeeded'
        and j.approved_at is not null
    ) into v_ok;

    if not v_ok then
      raise exception 'CATALOG_MASTER_NOT_READY' using errcode = '23514';
    end if;
  end if;

  if new.withdrawn_at is null and new.check_status is distinct from 'passed' then
    raise exception 'CATALOG_NOT_CHECKED' using errcode = '23514';
  end if;

  if new.withdrawn_at is not null and new.check_status not in ('pending', 'running', 'held') then
    new.in_rankings := false;
  elsif new.in_rankings then
    new.allow_ratings := true;
    new.allow_comments := true;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.catalog_works_guard() from public, anon, authenticated;

-- The work went live: when the owner asked, take the project's other live versions down.
create or replace function public.catalog_withdraw_older_versions(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;
  update public.catalog_works o
     set withdrawn_at = now(), in_rankings = false
    from public.catalog_works w
   where w.id = p_work_id
     and w.withdraw_older
     and o.project_id = w.project_id
     and o.owner_id = w.owner_id
     and o.id <> w.id
     and o.withdrawn_at is null;
end;
$function$;

revoke all on function public.catalog_withdraw_older_versions(uuid) from public, anon, authenticated;
grant execute on function public.catalog_withdraw_older_versions(uuid) to service_role;

-- Next files to fingerprint (anti-join in SQL: no 1000-row API cap). p_skip: keys that failed in this worker run.
create or replace function public.next_beat_needing_fingerprint(p_skip uuid[] default '{}')
returns table (beat_id uuid, asset_id uuid, storage_bucket text, object_key text, checksum_sha256 text)
language sql
security definer
set search_path = ''
as $function$
  select a.beat_id, a.id, a.storage_bucket, a.object_key, a.checksum_sha256
    from public.beat_audio_assets a
    join public.beats b on b.id = a.beat_id
   where a.purpose = 'MASTER' and a.status = 'READY' and a.is_active
     and b.status in ('APPROVED', 'PUBLISHED')
     and a.checksum_sha256 ~ '^[0-9a-f]{64}$'
     and not (a.id = any (coalesce(p_skip, '{}')))
     and not exists (
       select 1 from public.beat_audio_fingerprints f
        where f.master_asset_id = a.id and f.algorithm = 'chromaprint-raw-v1')
   order by b.updated_at desc
   limit 1;
$function$;

create or replace function public.next_sample_needing_fingerprint(p_skip text[] default '{}')
returns table (sample_id uuid, object_key text, review boolean)
language sql
security definer
set search_path = ''
as $function$
  select s.id,
         case when s.status = 'PUBLISHED' then c.object_key else s.object_key end,
         s.status = 'PENDING_REVIEW'
    from public.studio_samples s
    left join public.catalog_assets c on c.id = s.catalog_asset_id
   where s.status in ('PUBLISHED', 'PENDING_REVIEW')
     and (case when s.status = 'PUBLISHED' then c.object_key else s.object_key end) is not null
     and not ((case when s.status = 'PUBLISHED' then c.object_key else s.object_key end) = any (coalesce(p_skip, '{}')))
     and not exists (
       select 1 from public.sample_audio_fingerprints f
        where f.object_key = (case when s.status = 'PUBLISHED' then c.object_key else s.object_key end)
          and f.algorithm = 'chromaprint-raw-v1')
   order by s.updated_at desc
   limit 1;
$function$;

revoke all on function public.next_beat_needing_fingerprint(uuid[]) from public, anon, authenticated;
revoke all on function public.next_sample_needing_fingerprint(text[]) from public, anon, authenticated;
grant execute on function public.next_beat_needing_fingerprint(uuid[]) to service_role;
grant execute on function public.next_sample_needing_fingerprint(text[]) to service_role;

create or replace function public.claim_next_work_rights_check(p_worker_ref text)
returns table (
  id uuid,
  owner_id uuid,
  project_id uuid,
  master_job_id uuid,
  result_object_key text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  -- Never stuck hidden: three failed runs, or a master that can no longer be checked -> staff decide.
  update public.catalog_works w
     set check_status = 'held',
         checked_at = now(),
         check_summary = 'Sprawdzenie nie dało wyniku. Decyzja moderatora.',
         check_result = jsonb_build_object('reasons', jsonb_build_array('Sprawdzenie nie dało wyniku po kilku próbach albo master jest niedostępny.'))
   where (
       (w.check_status = 'running' and w.check_claimed_at < now() - interval '30 minutes' and w.check_attempts >= 3)
       or (w.check_status = 'pending' and not exists (
         select 1 from public.studio_master_jobs j
          where j.id = w.master_job_id and j.kind = 'master' and j.status = 'succeeded' and j.result_object_key is not null))
     );

  select w.id into v_id
    from public.catalog_works w
    join public.studio_master_jobs j on j.id = w.master_job_id
   where (
       w.check_status = 'pending'
       or (w.check_status = 'running' and w.check_claimed_at < now() - interval '30 minutes')
     )
     and w.check_attempts < 3
     and j.kind = 'master'
     and j.status = 'succeeded'
     and j.result_object_key is not null
   order by w.check_requested_at nulls first
   limit 1
   for update of w skip locked;

  if v_id is null then
    return;
  end if;

  update public.catalog_works w
     set check_status = 'running',
         check_claimed_at = now(),
         check_worker_ref = left(p_worker_ref, 120),
         check_attempts = w.check_attempts + 1
   where w.id = v_id;

  return query
    select w.id, w.owner_id, w.project_id, w.master_job_id, j.result_object_key
      from public.catalog_works w
      join public.studio_master_jobs j on j.id = w.master_job_id
     where w.id = v_id;
end;
$function$;

-- passed -> live (unless the owner withdrew meanwhile); held -> stays hidden for staff.
create or replace function public.complete_work_rights_check(
  p_work_id uuid,
  p_worker_ref text,
  p_passed boolean,
  p_result jsonb,
  p_summary text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'CATALOG_FORBIDDEN' using errcode = '42501';
  end if;

  select w.check_status into v_status
    from public.catalog_works w
   where w.id = p_work_id and w.check_worker_ref = left(p_worker_ref, 120)
   for update;

  if v_status is distinct from 'running' then
    return coalesce(v_status, 'missing');
  end if;

  if p_passed then
    update public.catalog_works w
       set check_status = 'passed',
           checked_at = now(),
           check_result = p_result,
           check_summary = left(p_summary, 500),
           withdrawn_at = null,
           published_at = now()
     where w.id = p_work_id;
    perform public.catalog_withdraw_older_versions(p_work_id);
    return 'passed';
  end if;

  update public.catalog_works w
     set check_status = 'held',
         checked_at = now(),
         check_result = p_result,
         check_summary = left(p_summary, 500)
   where w.id = p_work_id;
  return 'held';
end;
$function$;

revoke all on function public.claim_next_work_rights_check(text) from public, anon, authenticated;
revoke all on function public.complete_work_rights_check(uuid, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_next_work_rights_check(text) to service_role;
grant execute on function public.complete_work_rights_check(uuid, text, boolean, jsonb, text) to service_role;

-- 3) infringement reports ---------------------------------------------------------------

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null,
  target_id uuid not null,
  reason text not null,
  details text not null,
  reporter_id uuid references auth.users (id) on delete set null,
  reporter_name text,
  reporter_email text,
  good_faith boolean not null default false,
  ip_hash text,
  status text not null default 'open',
  staff_note text,
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_reports_kind_chk check (target_kind in ('work', 'beat', 'sample')),
  constraint content_reports_reason_chk check (reason in ('copyright', 'stolen_vocal', 'stolen_beat', 'other')),
  constraint content_reports_status_chk check (status in ('open', 'removed', 'rejected')),
  constraint content_reports_details_len check (char_length(details) between 10 and 4000),
  constraint content_reports_good_faith_chk check (good_faith)
);

create index if not exists content_reports_open_idx on public.content_reports (created_at desc) where status = 'open';
create index if not exists content_reports_target_idx on public.content_reports (target_kind, target_id);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id);
create index if not exists content_reports_handled_by_idx on public.content_reports (handled_by);
create index if not exists content_reports_ip_idx on public.content_reports (ip_hash, created_at desc);

alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;
revoke all on table public.content_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.content_reports to service_role;
drop policy if exists content_reports_service_all on public.content_reports;
create policy content_reports_service_all on public.content_reports
  for all to service_role using (true) with check (true);
