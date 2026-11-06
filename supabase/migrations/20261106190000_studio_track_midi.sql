-- Studio track MIDI notes. Shape is validated in the app (src/lib/studio/studio-midi.ts).
-- studio_tracks.midi = { "v": 1, "instrument": "sine"|"square"|"saw", "notes": [ { "t", "dur", "pitch", "vel" } ] }
-- NULL = no notes. Additive: existing tracks stay NULL.

alter table public.studio_tracks add column if not exists midi jsonb;

alter table public.studio_tracks drop constraint if exists studio_tracks_midi_shape_chk;
alter table public.studio_tracks add constraint studio_tracks_midi_shape_chk
  check (midi is null or (jsonb_typeof(midi) = 'object' and pg_column_size(midi) <= 20000));

-- Replace a track's notes with CAS on the project document version (same pattern as apply_automation).
create or replace function public.studio_cas_apply_midi(
  p_project_id uuid,
  p_owner_id uuid,
  p_track_id uuid,
  p_expected integer,
  p_midi jsonb
)
returns table(document_version integer, midi jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new integer;
begin
  if p_midi is not null and (jsonb_typeof(p_midi) <> 'object' or pg_column_size(p_midi) > 20000) then
    raise exception 'MIDI_INVALID';
  end if;

  -- Empty / missing notes clear the column (NULL), same as a null argument.
  if p_midi is not null and (
    jsonb_typeof(p_midi -> 'notes') is distinct from 'array'
    or jsonb_array_length(p_midi -> 'notes') = 0
  ) then
    p_midi := null;
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
  set midi = p_midi
  where id = p_track_id
    and project_id = p_project_id;

  if not found then
    raise exception 'TRACK_NOT_FOUND';
  end if;

  return query select v_new, p_midi;
end;
$function$;

revoke all on function public.studio_cas_apply_midi(uuid, uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.studio_cas_apply_midi(uuid, uuid, uuid, integer, jsonb) to service_role;
