-- Studio track automation (Silver/Gold): gain and pan envelopes per track.
-- studio_tracks.automation = { "v": 1, "lanes": [ { "param": "gainDb"|"pan", "points": [ { "t": ms, "v": value } ] } ] }
-- The shape is validated in the app (src/lib/studio/studio-automation.ts); the DB guards type and size.
-- Additive: existing tracks get NULL (= no automation, static gain/pan as before).

alter table public.studio_tracks add column if not exists automation jsonb;

alter table public.studio_tracks drop constraint if exists studio_tracks_automation_shape_chk;
alter table public.studio_tracks add constraint studio_tracks_automation_shape_chk
  check (automation is null or (jsonb_typeof(automation) = 'object' and pg_column_size(automation) <= 20000));

-- Replace a track's automation with CAS on the project document version (same pattern as apply_fx_chain).
create or replace function public.studio_cas_apply_automation(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_automation jsonb
)
returns table(document_version integer, automation jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new integer;
begin
  if p_automation is not null and (jsonb_typeof(p_automation) <> 'object' or pg_column_size(p_automation) > 20000) then
    raise exception 'AUTOMATION_INVALID';
  end if;

  update public.studio_projects
  set document_version = studio_projects.document_version + 1
  where id = p_project_id
    and owner_id = p_owner_id
    and studio_projects.document_version = p_expected
  returning studio_projects.document_version into v_new;

  if v_new is null then
    return;
  end if;

  update public.studio_tracks
  set automation = p_automation
  where id = p_track_id
    and project_id = p_project_id;

  if not found then
    raise exception 'TRACK_NOT_FOUND';
  end if;

  return query select v_new, p_automation;
end;
$function$;

revoke all on function public.studio_cas_apply_automation(uuid, uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.studio_cas_apply_automation(uuid, uuid, uuid, integer, jsonb) to service_role;
