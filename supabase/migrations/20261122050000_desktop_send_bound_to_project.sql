-- 2026-11-22 code review: the Windows recorder daily send limit was client-only.
-- A client could skip POST /api/desktop/studio-send, or DELETE (refund) after a
-- successful upload. Now a recorder (bearer) place into a project needs a send from
-- the last 24 h; the first place binds that send to the project (used_at), and a used
-- send can no longer be refunded.

alter table public.desktop_studio_sends
  add column if not exists project_id uuid,
  add column if not exists used_at timestamptz;


create or replace function public.use_desktop_studio_send(p_owner_id uuid, p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'DESKTOP_SEND_FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop_send_use:' || p_owner_id::text, 0));
  -- Same send, further places / resume into the same project.
  if exists (
    select 1 from public.desktop_studio_sends
    where owner_id = p_owner_id and project_id = p_project_id
      and created_at > now() - interval '24 hours'
  ) then
    return true;
  end if;
  select id into v_id
  from public.desktop_studio_sends
  where owner_id = p_owner_id and project_id is null
    and created_at > now() - interval '24 hours'
  order by created_at desc
  limit 1
  for update;
  if v_id is null then
    return false;
  end if;
  update public.desktop_studio_sends
     set project_id = p_project_id, used_at = now()
   where id = v_id;
  return true;
end;
$function$;
revoke all on function public.use_desktop_studio_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_desktop_studio_send(uuid, uuid) to service_role;
