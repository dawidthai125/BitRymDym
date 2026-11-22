-- 2026-11-22 (follow-up to 20261122050000_desktop_send_bound_to_project):
--   1. A project already bound to a send accepts further places / resume at any age
--      (the 24 h window blocked finishing a project started earlier).
--   2. The recorder passes its send id (POST /api/desktop/studio-send -> sendId); the place
--      binds exactly that send when it is the caller's, unused and from the last 24 h.
--      Without an id (older recorder builds) the newest free send is bound, as before.
-- No data change. The 2-arg function is replaced by a 3-arg one with p_send_id default null:
-- a same-name overload would make PostgREST calls with two named args ambiguous (PGRST203),
-- and old app code calling (p_owner_id, p_project_id) keeps working through the default.

drop function if exists public.use_desktop_studio_send(uuid, uuid);

create or replace function public.use_desktop_studio_send(
  p_owner_id uuid,
  p_project_id uuid,
  p_send_id uuid default null
)
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
  if p_owner_id is null or p_project_id is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('desktop_send_use:' || p_owner_id::text, 0));
  -- Same project, further places / resume: no new send, no age limit.
  if exists (
    select 1 from public.desktop_studio_sends
    where owner_id = p_owner_id and project_id = p_project_id
  ) then
    return true;
  end if;
  if p_send_id is not null then
    -- Exactly the recorder's send: own, unused, from the last 24 h. Otherwise no fallback.
    select id into v_id
    from public.desktop_studio_sends
    where id = p_send_id and owner_id = p_owner_id and project_id is null
      and created_at > now() - interval '24 hours'
    for update;
  else
    -- Older recorder builds send no id: newest free send of the last 24 h.
    select id into v_id
    from public.desktop_studio_sends
    where owner_id = p_owner_id and project_id is null
      and created_at > now() - interval '24 hours'
    order by created_at desc
    limit 1
    for update;
  end if;
  if v_id is null then
    return false;
  end if;
  update public.desktop_studio_sends
     set project_id = p_project_id, used_at = now()
   where id = v_id;
  return true;
end;
$function$;
revoke all on function public.use_desktop_studio_send(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_desktop_studio_send(uuid, uuid, uuid) to service_role;
