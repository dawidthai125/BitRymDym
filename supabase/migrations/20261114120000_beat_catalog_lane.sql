-- Waiting catalog: a generated platform beat stays free until an admin
-- releases it as free or paid. Existing rows keep the default (free).
-- A change of catalog_lane is allowed only for service_role or an admin.
-- Does not replace prevent_beat_privilege_escalation.
-- Not applied from the app. Apply with the normal migration path before
-- the catalog_lane selects are deployed.

alter table public.beats
  add column if not exists catalog_lane text not null default 'free';

alter table public.beats
  drop constraint if exists beats_catalog_lane_chk;

alter table public.beats
  add constraint beats_catalog_lane_chk
    check (catalog_lane in ('free', 'paid'));

comment on column public.beats.catalog_lane is
  'free (default, public catalogue and Studio) or paid (paid catalogue only, not Studio). Existing rows stay free. Only service_role or an admin may change it.';

-- Table-level UPDATE includes every column, so a single-column revoke does nothing.
-- Drop table UPDATE for anon and signed-in users, then give signed-in users
-- every column except catalog_lane. service_role keeps the table grant.
revoke update on table public.beats from anon, authenticated;
grant update (
  id,
  owner_id,
  ownership_type,
  title,
  producer,
  description,
  genre,
  style,
  bpm,
  key,
  scale,
  duration_seconds,
  tags,
  cover_ref,
  status,
  created_at,
  updated_at,
  rejection_reason,
  last_submitted_at,
  visibility,
  allow_download,
  allow_studio_use,
  cover_path,
  cover_thumb_path,
  cover_status,
  cover_moderation,
  cover_rejection_reason,
  cover_updated_at,
  key_detected,
  key_confidence,
  allow_comments
) on table public.beats to authenticated;

create or replace function public.beats_catalog_lane_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.catalog_lane is distinct from 'free'
       and auth.role() is distinct from 'service_role'
       and not public.is_admin() then
      raise exception 'catalog_lane may be changed only by service_role or an admin'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE'
     and new.catalog_lane is distinct from old.catalog_lane
     and auth.role() is distinct from 'service_role'
     and not public.is_admin() then
    raise exception 'catalog_lane may be changed only by service_role or an admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists beats_catalog_lane_guard on public.beats;
create trigger beats_catalog_lane_guard
  before insert or update on public.beats
  for each row
  execute function public.beats_catalog_lane_guard();

revoke all on function public.beats_catalog_lane_guard() from public, anon, authenticated;
