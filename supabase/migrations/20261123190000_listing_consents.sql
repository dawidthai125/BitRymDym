-- Same owner choices for beats, samples and finished tracks (owner decision 2026-11-23):
-- catalogue / ratings / comments / ranking. Rule as in catalog_works: a ranking entry needs
-- ratings and comments. User works start with everything optional OFF; BitRymDym works ON.
set local lock_timeout = '5s';

-- Existing public works keep what they have today (all 61 beats are public BitRymDym beats with
-- comments on). A temporary default fills beats without touching updated_at.
alter table public.beats
  add column if not exists allow_ratings boolean default true,
  add column if not exists in_rankings boolean default true;
alter table public.beats
  alter column allow_ratings drop default,
  alter column in_rankings drop default;

alter table public.studio_samples
  add column if not exists allow_ratings boolean,
  add column if not exists in_rankings boolean;
-- A user's sample that is not in the catalogue yet has no choice made: everything off.
update public.studio_samples s
   set allow_ratings = false, allow_comments = false, in_rankings = false
 where s.status <> 'PUBLISHED'
   and not exists (select 1 from public.profiles p where p.id = s.owner_id and p.role = 'ADMIN');
update public.studio_samples set allow_ratings = true where allow_ratings is null;
update public.studio_samples set in_rankings = allow_comments where in_rankings is null;

-- No column default: the insert trigger fills NULL by owner type.
alter table public.beats alter column allow_comments drop default;
alter table public.studio_samples alter column allow_comments drop default;

create or replace function public.beats_consent_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_platform boolean := new.ownership_type = 'PLATFORM';
begin
  new.allow_ratings := coalesce(new.allow_ratings, v_platform);
  new.allow_comments := coalesce(new.allow_comments, v_platform);
  new.in_rankings := coalesce(new.in_rankings, v_platform and new.allow_ratings and new.allow_comments);
  return new;
end;
$$;

create or replace function public.studio_samples_consent_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform boolean;
begin
  select exists (
    select 1 from public.profiles p where p.id = new.owner_id and p.role = 'ADMIN'
  ) into v_platform;
  new.allow_ratings := coalesce(new.allow_ratings, v_platform);
  new.allow_comments := coalesce(new.allow_comments, v_platform);
  new.in_rankings := coalesce(new.in_rankings, v_platform and new.allow_ratings and new.allow_comments);
  return new;
end;
$$;

revoke all on function public.beats_consent_defaults() from public, anon, authenticated;
revoke all on function public.studio_samples_consent_defaults() from public, anon, authenticated;

drop trigger if exists beats_consent_defaults on public.beats;
create trigger beats_consent_defaults before insert on public.beats
  for each row execute function public.beats_consent_defaults();
drop trigger if exists studio_samples_consent_defaults on public.studio_samples;
create trigger studio_samples_consent_defaults before insert on public.studio_samples
  for each row execute function public.studio_samples_consent_defaults();

alter table public.beats alter column allow_ratings set not null, alter column in_rankings set not null;
alter table public.studio_samples alter column allow_ratings set not null, alter column in_rankings set not null;

alter table public.beats drop constraint if exists beats_rank_consents;
alter table public.beats add constraint beats_rank_consents
  check (not in_rankings or (allow_ratings and allow_comments));
alter table public.studio_samples drop constraint if exists studio_samples_rank_consents;
alter table public.studio_samples add constraint studio_samples_rank_consents
  check (not in_rankings or (allow_ratings and allow_comments));

comment on column public.beats.allow_ratings is 'Author switch. Ignored while the beat is private.';
comment on column public.beats.in_rankings is 'Author switch. Needs ratings and comments.';
comment on column public.studio_samples.allow_ratings is 'Author switch. Ignored unless public_listing is on.';
comment on column public.studio_samples.in_rankings is 'Author switch. Needs ratings and comments.';

-- A track can always be withdrawn, also when its master is no longer usable.
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

  if new.withdrawn_at is not null then
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
