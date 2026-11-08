-- Saved catalogue beats per account. Owner reads and writes only their rows.

create table if not exists public.beat_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, beat_id)
);

create index if not exists beat_favorites_user_created_idx
  on public.beat_favorites (user_id, created_at desc);

alter table public.beat_favorites enable row level security;

drop policy if exists beat_favorites_select_own on public.beat_favorites;
create policy beat_favorites_select_own on public.beat_favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists beat_favorites_insert_own on public.beat_favorites;
create policy beat_favorites_insert_own on public.beat_favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists beat_favorites_delete_own on public.beat_favorites;
create policy beat_favorites_delete_own on public.beat_favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.beat_favorites from anon;
grant select, insert, delete on public.beat_favorites to authenticated;

comment on table public.beat_favorites is 'Beats a user saved from the catalogue. One row per account and beat.';
