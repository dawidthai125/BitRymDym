-- Catalogue of an approved master. The owner opts in.
-- Ranking opt-in requires ratings and comments. Catalogue-only does not.
-- No audio object key. No prize rows. community_rewards stays beat/sample, week/month.

create table if not exists public.catalog_works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  master_job_id uuid not null unique references public.studio_master_jobs (id) on delete cascade,
  title text not null,
  allow_ratings boolean not null default false,
  allow_comments boolean not null default false,
  in_rankings boolean not null default false,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_works_title_len check (char_length(title) between 1 and 80),
  constraint catalog_works_rank_consents check (not in_rankings or (allow_ratings and allow_comments))
);

create index if not exists catalog_works_live_idx
  on public.catalog_works (published_at desc)
  where withdrawn_at is null;

create index if not exists catalog_works_rank_idx
  on public.catalog_works (published_at desc)
  where withdrawn_at is null and in_rankings;

comment on table public.catalog_works is
  'Owner opt-in listing of one approved master. No audio key. A ranking flag requires ratings and comments. Prizes are not stored here.';

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

drop trigger if exists catalog_works_guard_trg on public.catalog_works;
create trigger catalog_works_guard_trg
  before insert or update on public.catalog_works
  for each row execute function public.catalog_works_guard();

revoke all on function public.catalog_works_guard() from public, anon, authenticated;

alter table public.catalog_works enable row level security;
alter table public.catalog_works force row level security;
revoke all on table public.catalog_works from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_works to service_role;

drop policy if exists catalog_works_service_all on public.catalog_works;
create policy catalog_works_service_all
  on public.catalog_works
  for all
  to service_role
  using (true)
  with check (true);

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'community_ratings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%target_kind%'
  loop
    execute format('alter table public.community_ratings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.community_ratings
  add constraint community_ratings_target_kind_check
  check (target_kind in ('beat', 'sample', 'work'));

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'community_comments'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%target_kind%'
  loop
    execute format('alter table public.community_comments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.community_comments
  add constraint community_comments_target_kind_check
  check (target_kind in ('beat', 'sample', 'work'));
