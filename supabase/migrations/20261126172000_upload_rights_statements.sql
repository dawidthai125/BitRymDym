-- Rights statement on uploaded audio, enforced by the server (owner order 2026-11-26).
-- "Importuj wokal", stems and "Sam mastering": the upload session is refused without the statement;
-- each accepted statement is stored here (who, project, statement text version, when) and the file's
-- SHA-256 is added at finalize. The browser prompt is only a convenience now.
-- Kept as evidence: no FK to auth.users (an account deletion does not erase the statement; see the
-- privacy policy, retention section). service_role only.

create table if not exists public.upload_rights_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  take_id uuid unique references public.takes (id) on delete set null,
  project_id uuid references public.studio_projects (id) on delete set null,
  upload_kind text not null,
  statement_version text not null,
  accepted_at timestamptz not null default now(),
  file_sha256 text,
  constraint upload_rights_kind_chk check (upload_kind in ('vocal_import', 'stem', 'master_only')),
  constraint upload_rights_version_chk check (char_length(statement_version) between 1 and 40),
  constraint upload_rights_sha_chk check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists upload_rights_statements_user_idx on public.upload_rights_statements (user_id, accepted_at desc);
create index if not exists upload_rights_statements_project_idx on public.upload_rights_statements (project_id) where project_id is not null;

alter table public.upload_rights_statements enable row level security;
alter table public.upload_rights_statements force row level security;
revoke all on table public.upload_rights_statements from public, anon, authenticated;
grant select, insert, update on table public.upload_rights_statements to service_role;
drop policy if exists upload_rights_statements_service_all on public.upload_rights_statements;
create policy upload_rights_statements_service_all on public.upload_rights_statements
  for all to service_role using (true) with check (true);

comment on table public.upload_rights_statements is
  'Rights statements accepted before an audio upload (vocal import, stem, Sam mastering): user, project, statement version, time, file SHA-256. Evidence, service_role only.';
