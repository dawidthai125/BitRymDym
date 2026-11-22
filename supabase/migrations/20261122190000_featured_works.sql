-- "Utwór tygodnia" (2026-11-22): one featured catalogue work per Europe/Warsaw week (Monday).
-- Service role only. The public pages read it server-side and re-check the work through
-- findLiveCatalogWork (catalog_works is service-role only too), so a withdrawn work is never shown.
-- No anon/authenticated policy on purpose: no public read path to bypass the live-work gate.

create table if not exists public.featured_works (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.catalog_works (id) on delete cascade,
  week_start date not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Author mail claim (sent once per row; see featureWorkForWeek).
  notified_at timestamptz,
  constraint featured_works_week_start_key unique (week_start),
  constraint featured_works_week_monday check (extract(isodow from week_start) = 1),
  constraint featured_works_note_len check (note is null or char_length(note) between 1 and 280)
);

create index if not exists featured_works_work_idx on public.featured_works (work_id);
create index if not exists featured_works_created_by_idx on public.featured_works (created_by);

comment on table public.featured_works is
  'Utwór tygodnia: one catalogue work per Warsaw week (week_start = Monday). Service role only; public pages re-check the work is still live.';

alter table public.featured_works enable row level security;
alter table public.featured_works force row level security;
revoke all on table public.featured_works from public, anon, authenticated;
grant select, insert, update, delete on table public.featured_works to service_role;

drop policy if exists featured_works_service_all on public.featured_works;
create policy featured_works_service_all
  on public.featured_works
  for all
  to service_role
  using (true)
  with check (true);
