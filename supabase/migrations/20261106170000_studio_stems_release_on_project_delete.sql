-- Deleting a project must not orphan its stem files in storage.
-- Before: takes.stem_project_id ... ON DELETE CASCADE removed the rows, leaving the audio objects behind
-- (the janitor works from take rows). Now a BEFORE DELETE trigger turns the project's stems into
-- DELETED takes detached from the project; the existing takes janitor then removes their objects.

alter table public.takes drop constraint if exists takes_stem_project_chk;
alter table public.takes add constraint takes_stem_project_chk check (
  (is_stem and (stem_project_id is not null or status = 'DELETED'))
  or (not is_stem and stem_project_id is null)
);

create or replace function public.studio_projects_release_stems()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.takes t
  set status = 'DELETED',
      deleted_at = coalesce(t.deleted_at, now()),
      stem_project_id = null
  where t.stem_project_id = old.id;
  return old;
end;
$function$;

revoke all on function public.studio_projects_release_stems() from public, anon, authenticated;

drop trigger if exists studio_projects_release_stems_trg on public.studio_projects;
create trigger studio_projects_release_stems_trg
  before delete on public.studio_projects
  for each row execute function public.studio_projects_release_stems();
