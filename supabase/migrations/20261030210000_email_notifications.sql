-- E-mail notifications: per-user preferences + one-shot markers (welcome, job ready).
-- Sending is gated in code (EMAIL_NOTIFICATIONS_ENABLED + Resend + EMAIL_UNSUBSCRIBE_SECRET).

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_account boolean not null default true,
  email_moderation boolean not null default true,
  email_studio boolean not null default true,
  welcome_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- Owner may read own row; writes go through server code (service role) only.
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.notification_preferences from anon, authenticated;

alter table public.studio_master_jobs add column if not exists notified_at timestamptz;

comment on table public.notification_preferences is 'E-mail notification opt-outs (account / moderation / studio). Missing row = all on.';
comment on column public.studio_master_jobs.notified_at is 'When the "ready" e-mail was claimed for this job (dedupe).';
