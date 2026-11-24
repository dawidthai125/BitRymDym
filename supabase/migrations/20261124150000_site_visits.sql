-- 2026-11-24: cookieless entry counter for the owner (/admin/lejek). Additive only.
-- Aggregates per Warsaw day, page group and traffic source. No user id, IP, user agent,
-- cookie or any other identifier is stored, so a row cannot be tied to a person.
create table if not exists public.site_visits (
  day date not null,
  path text not null,
  source text not null,
  views integer not null default 0,
  constraint site_visits_pkey primary key (day, path, source),
  constraint site_visits_path_chk check (path ~ '^/[a-z0-9/-]{0,60}$' or path = 'inne'),
  constraint site_visits_source_chk check (source ~ '^[a-z]{1,12}$'),
  constraint site_visits_views_chk check (views >= 0)
);

comment on table public.site_visits is
  'Anonymous entry counters (day × page group × source). Written by record_site_visit; no personal data.';

-- Service role only: RLS on, no policies, no grants for client roles.
alter table public.site_visits enable row level security;
revoke all on table public.site_visits from anon, authenticated;

create or replace function public.record_site_visit(p_path text, p_source text)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.site_visits as v (day, path, source, views)
  values ((now() at time zone 'Europe/Warsaw')::date, p_path, p_source, 1)
  on conflict (day, path, source) do update set views = v.views + 1;
$function$;

revoke all on function public.record_site_visit(text, text) from public, anon, authenticated;
grant execute on function public.record_site_visit(text, text) to service_role;

-- Totals for the last p_days Warsaw days (today included).
create or replace function public.site_visit_stats(p_days integer)
returns table (kind text, key text, views bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  with w as (
    select v.day, v.path, v.source, v.views
    from public.site_visits v
    where v.day > (now() at time zone 'Europe/Warsaw')::date - least(greatest(coalesce(p_days, 7), 1), 366)
  )
  select 'day', w.day::text, sum(w.views) from w group by w.day
  union all
  select 'source', w.source, sum(w.views) from w group by w.source
  union all
  (select 'path', w.path, sum(w.views) from w group by w.path order by 3 desc limit 20);
$function$;

revoke all on function public.site_visit_stats(integer) from public, anon, authenticated;
grant execute on function public.site_visit_stats(integer) to service_role;
