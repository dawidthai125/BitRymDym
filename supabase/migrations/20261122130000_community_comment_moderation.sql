-- 2026-11-22: community comment moderation (DSA art. 16 notice-and-action).
-- NOT APPLIED. Apply only through the approved migration process.
--
-- * Authors soft-delete their own comments (deleted_at).
-- * The owner of the beat/sample/work, or staff, hides a comment (hidden_at, hidden_by, hidden_reason).
-- * Signed-in members report a comment once each (community_comment_reports).
--   Three distinct open reports hide it automatically until staff decides.
-- * Staff decisions in /admin/moderation write admin_audit_events.
--
-- Access model (unchanged for community_comments): no grants and no policies for anon/authenticated.
-- Every read and write goes through server code with the service_role client after its own
-- authorization check, and the public thread query filters deleted_at/hidden_at. The new reports
-- table follows the same model: service_role only, so reporters and details never reach the
-- public API, and staff read them only through the server-checked admin panel.
-- Additive only: no data is removed.

alter table public.community_comments
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles (id) on delete set null,
  add column if not exists hidden_reason text;

alter table public.community_comments drop constraint if exists community_comments_hidden_reason_check;
alter table public.community_comments
  add constraint community_comments_hidden_reason_check
  check (hidden_reason is null or hidden_reason in ('owner', 'staff', 'reports'));

-- Public thread reads only visible comments, newest first.
create index if not exists community_comments_visible_target_idx
  on public.community_comments (target_kind, target_id, created_at desc)
  where deleted_at is null and hidden_at is null;

create index if not exists community_comments_hidden_by_fk_idx
  on public.community_comments (hidden_by);

create table if not exists public.community_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'illegal', 'other')),
  details text check (details is null or char_length(details) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint community_comment_reports_one_per_reporter unique (comment_id, reporter_id)
);

comment on table public.community_comment_reports is
  'Member reports on community comments (DSA art. 16). One per member per comment. service_role only.';

create index if not exists community_comment_reports_open_idx
  on public.community_comment_reports (status, created_at);

create index if not exists community_comment_reports_reporter_idx
  on public.community_comment_reports (reporter_id, created_at desc);

create index if not exists community_comment_reports_resolved_by_fk_idx
  on public.community_comment_reports (resolved_by);

alter table public.community_comment_reports enable row level security;
alter table public.community_comment_reports force row level security;

revoke all on table public.community_comment_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.community_comment_reports to service_role;

drop policy if exists community_comment_reports_service_all on public.community_comment_reports;
create policy community_comment_reports_service_all
  on public.community_comment_reports
  for all
  to service_role
  using (true)
  with check (true);

-- Staff decisions on reported comments are audited.
alter table public.admin_audit_events drop constraint if exists admin_audit_events_action_chk;
alter table public.admin_audit_events add constraint admin_audit_events_action_chk check (
  action = any (array[
    'ROLE_CHANGE', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'MODERATOR_GRANT', 'MODERATOR_REVOKE',
    'PREMIUM_TIER_CHANGE', 'PREMIUM_EXPIRATION_CHANGE', 'USER_ACCOUNT_DELETE', 'SAMPLE_POLICY_UPDATE',
    'BEAT_METADATA_UPDATE', 'SITE_MAINTENANCE_UPDATE', 'PLAN_ADDON_GRANT', 'PLAN_ADDON_REVOKE',
    'BEAT_COVER_REVIEW', 'BEAT_OWNER_UPDATE', 'USAGE_RESET', 'PAYMENT_REVIEW_RESOLVE',
    'COMMUNITY_COMMENT_HIDE', 'COMMUNITY_REPORT_DISMISS'
  ]::text[])
);
