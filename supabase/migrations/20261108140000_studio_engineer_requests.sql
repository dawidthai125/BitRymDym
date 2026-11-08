-- Engineer queue. Authenticated users read and insert only their own rows.
-- No update policy for authenticated. service_role has full access.

create table if not exists public.studio_engineer_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid null,
  body text not null check (char_length(body) between 4 and 2000),
  status text not null default 'open' check (status in ('open', 'answered')),
  answer text null,
  created_at timestamptz default now()
);

alter table public.studio_engineer_requests enable row level security;

revoke all on table public.studio_engineer_requests from public, anon, authenticated;
grant select, insert on table public.studio_engineer_requests to authenticated;
grant select, insert, update, delete on table public.studio_engineer_requests to service_role;

drop policy if exists studio_engineer_requests_select_own on public.studio_engineer_requests;
create policy studio_engineer_requests_select_own
  on public.studio_engineer_requests
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists studio_engineer_requests_insert_own on public.studio_engineer_requests;
create policy studio_engineer_requests_insert_own
  on public.studio_engineer_requests
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists studio_engineer_requests_service_all on public.studio_engineer_requests;
create policy studio_engineer_requests_service_all
  on public.studio_engineer_requests
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.studio_engineer_requests is
  'Open notes for a human engineer. No automated answers.';
