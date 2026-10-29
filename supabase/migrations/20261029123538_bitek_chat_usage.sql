-- BITEK chat: per-user daily message counter (stage 1b). PREPARED — NOT APPLIED.
create table if not exists public.bitek_chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day)
);

alter table public.bitek_chat_usage enable row level security;
-- No policies: rows are only touched through the security-definer function below.
revoke all on public.bitek_chat_usage from anon, authenticated;

create or replace function public.bitek_chat_consume(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_used integer;
begin
  if v_uid is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;
  insert into public.bitek_chat_usage as u (user_id, day, used)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set used = u.used + 1
    where u.used < p_limit
  returning used into v_used;
  return v_used is not null;
end;
$$;

revoke all on function public.bitek_chat_consume(integer) from public, anon;
grant execute on function public.bitek_chat_consume(integer) to authenticated;
