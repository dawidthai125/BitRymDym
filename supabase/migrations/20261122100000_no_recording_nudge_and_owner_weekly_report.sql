-- 2026-11-22: two additions to the daily /api/cron/takes-expiry-notice run. Additive only.
--
-- 1) "Nic jeszcze nie nagrałeś" e-mail: once per account, 3–10 days after sign-up, when the
--    account has no own recording and no Studio project. notification_preferences.
--    no_recording_nudge_sent_at is the one-shot claim (same pattern as welcome_sent_at).
--    list_no_recording_nudge_candidates() returns raw flags; the pure TypeScript planner
--    (src/lib/email/notify/no-recording-plan.ts) decides who gets the mail.
--
-- 2) Weekly owner report (Mondays, Europe/Warsaw): owner_report_runs dedupes one mail per
--    week; owner_weekly_report_stats() returns aggregate numbers only (no personal data).
--
-- Everything is service_role only.

-- 1) ------------------------------------------------------------------------------------
alter table public.notification_preferences
  add column if not exists no_recording_nudge_sent_at timestamptz;

comment on column public.notification_preferences.no_recording_nudge_sent_at is
  'Set by /api/cron/takes-expiry-notice right before the one-time "nic jeszcze nie nagrałeś" e-mail; null = never mailed.';

create or replace function public.list_no_recording_nudge_candidates(
  p_created_after timestamptz,
  p_created_before timestamptz,
  p_limit integer default 2000
)
returns table (
  user_id uuid,
  created_at timestamptz,
  email_confirmed boolean,
  role text,
  has_take boolean,
  has_project boolean,
  studio_mail_on boolean,
  nudge_sent_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    u.id,
    u.created_at,
    u.email is not null and u.email_confirmed_at is not null,
    coalesce(p.role::text, 'USER'),
    exists (
      select 1 from public.takes t
      where t.owner_id = u.id
        and not t.is_stem
        and (t.title is null or (t.title not like 'smp:%' and t.title not like 'catalog:%'))
    ),
    exists (select 1 from public.studio_projects sp where sp.owner_id = u.id),
    coalesce(np.email_studio, true),
    np.no_recording_nudge_sent_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.notification_preferences np on np.user_id = u.id
  where u.created_at > p_created_after
    and u.created_at <= p_created_before
    and u.deleted_at is null
    and not coalesce(u.is_anonymous, false)
    and (u.banned_until is null or u.banned_until < now())
    and np.no_recording_nudge_sent_at is null
  order by u.created_at asc, u.id asc
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
$function$;

revoke all on function public.list_no_recording_nudge_candidates(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.list_no_recording_nudge_candidates(timestamptz, timestamptz, integer) to service_role;

-- 2) ------------------------------------------------------------------------------------
create table if not exists public.owner_report_runs (
  kind text not null,
  period_key date not null,
  created_at timestamptz not null default now(),
  constraint owner_report_runs_pkey primary key (kind, period_key),
  constraint owner_report_runs_kind_chk check (kind in ('weekly'))
);

comment on table public.owner_report_runs is
  'One row per sent owner report (kind + Warsaw date of the Monday run). Insert = claim, so a cron retry never mails twice.';

-- Service role only: RLS on, no policies, no grants for client roles.
alter table public.owner_report_runs enable row level security;
revoke all on table public.owner_report_runs from public, anon, authenticated;
grant select, insert, delete on table public.owner_report_runs to service_role;

create or replace function public.owner_weekly_report_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with real_takes as (
    select t.owner_id
    from public.takes t
    where t.created_at >= p_from and t.created_at < p_to
      and not t.is_stem
      and t.status not in ('PENDING_UPLOAD', 'FAILED')
      and (t.title is null or (t.title not like 'smp:%' and t.title not like 'catalog:%'))
  ),
  master_jobs as (
    select j.kind, j.status
    from public.studio_master_jobs j
    where coalesce(j.finished_at, j.created_at) >= p_from and coalesce(j.finished_at, j.created_at) < p_to
  )
  select jsonb_build_object(
    'new_accounts', (select count(*) from public.profiles p where p.created_at >= p_from and p.created_at < p_to),
    'orders_started', (select count(*) from public.payment_orders o where o.created_at >= p_from and o.created_at < p_to),
    'payments_count', (select count(*) from public.payment_orders o
                        where o.paid_at >= p_from and o.paid_at < p_to and o.status in ('paid', 'refunded')),
    'payments_grosz', (select coalesce(sum(o.amount_grosz), 0) from public.payment_orders o
                        where o.paid_at >= p_from and o.paid_at < p_to and o.status in ('paid', 'refunded')),
    'refunds_count', (select count(*) from public.payment_orders o
                       where o.refunded_at >= p_from and o.refunded_at < p_to and o.status = 'refunded'),
    'refunds_grosz', (select coalesce(sum(o.amount_grosz), 0) from public.payment_orders o
                       where o.refunded_at >= p_from and o.refunded_at < p_to and o.status = 'refunded'),
    'active_recorders', (select count(distinct r.owner_id) from real_takes r where r.owner_id is not null),
    'new_takes', (select count(*) from real_takes),
    'masters_done', (select count(*) from master_jobs m where m.kind = 'master' and m.status = 'succeeded'),
    'videos_done', (select count(*) from master_jobs m where m.kind = 'youtube_video' and m.status = 'succeeded'),
    'works_published', (select count(*) from public.catalog_works w where w.published_at >= p_from and w.published_at < p_to),
    'failed_master', (select count(*) from master_jobs m where m.kind = 'master' and m.status = 'failed'),
    'failed_video', (select count(*) from master_jobs m where m.kind = 'youtube_video' and m.status = 'failed'),
    'failed_export', (select count(*) from master_jobs m where m.kind not in ('master', 'youtube_video') and m.status = 'failed'),
    'failed_separate', (select count(*) from public.studio_separate_jobs s
                         where s.status = 'failed'
                           and coalesce(s.finished_at, s.created_at) >= p_from and coalesce(s.finished_at, s.created_at) < p_to),
    'failed_cleanup', (select count(*) from public.studio_cleanup_jobs c
                        where c.status = 'failed'
                          and coalesce(c.finished_at, c.created_at) >= p_from and coalesce(c.finished_at, c.created_at) < p_to),
    'failed_render', (select count(*) from public.render_jobs r
                       where r.status in ('FAILED', 'TIMEOUT')
                         and coalesce(r.finished_at, r.created_at) >= p_from and coalesce(r.finished_at, r.created_at) < p_to),
    'funnel', coalesce((select jsonb_object_agg(f.event, f.n) from (
                 select fe.event, count(*) as n from public.funnel_events fe
                 where fe.created_at >= p_from and fe.created_at < p_to
                 group by fe.event) f), '{}'::jsonb),
    'nudges_sent', (select count(*) from public.notification_preferences np
                     where np.no_recording_nudge_sent_at >= p_from and np.no_recording_nudge_sent_at < p_to)
  );
$function$;

revoke all on function public.owner_weekly_report_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.owner_weekly_report_stats(timestamptz, timestamptz) to service_role;
