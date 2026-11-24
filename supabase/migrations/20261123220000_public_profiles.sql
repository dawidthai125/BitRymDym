-- Public creator profiles (owner request 2026-11-23): /tworca/<public_id>-<ksywka>.
-- Applied 2026-11-24 (owner approval).
--
-- Everything is opt-in: the profile is off by default and every shown item has its own switch.
-- Access model: service_role only. Server routes check the session, the page filters by the
-- switches before anything reaches the browser. The address uses a random short public_id:
-- profiles.user_number stays private (admins only) and the account uuid is never shown.
-- Account deletion: auth.users -> profiles -> public_profiles, all on delete cascade.
-- Additive only: no data is removed.
set local lock_timeout = '5s';

create table if not exists public.public_profiles (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  public_id text not null,
  enabled boolean not null default false,
  -- Set by an administrator: the profile stays hidden whatever the owner switches on.
  blocked boolean not null default false,
  link_youtube text,
  link_spotify text,
  link_instagram text,
  link_facebook text,
  link_tiktok text,
  link_soundcloud text,
  show_links boolean not null default false,
  show_track_count boolean not null default false,
  show_recording_count boolean not null default false,
  show_beats boolean not null default false,
  show_samples boolean not null default false,
  show_works boolean not null default false,
  show_rankings boolean not null default false,
  show_experience boolean not null default false,
  show_joined boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_profiles_public_id_key unique (public_id),
  constraint public_profiles_public_id_chk check (public_id ~ '^[a-z2-9]{10}$'),
  -- Second line of defence; the app allows only known profile paths on these hosts.
  constraint public_profiles_link_youtube_chk check (
    link_youtube is null or (char_length(link_youtube) <= 200 and link_youtube ~ '^https://(www|music)\.youtube\.com/[^[:space:]]+$')),
  constraint public_profiles_link_spotify_chk check (
    link_spotify is null or (char_length(link_spotify) <= 200 and link_spotify ~ '^https://open\.spotify\.com/[^[:space:]]+$')),
  constraint public_profiles_link_instagram_chk check (
    link_instagram is null or (char_length(link_instagram) <= 200 and link_instagram ~ '^https://www\.instagram\.com/[^[:space:]]+$')),
  constraint public_profiles_link_facebook_chk check (
    link_facebook is null or (char_length(link_facebook) <= 200 and link_facebook ~ '^https://www\.facebook\.com/[^[:space:]]+$')),
  constraint public_profiles_link_tiktok_chk check (
    link_tiktok is null or (char_length(link_tiktok) <= 200 and link_tiktok ~ '^https://www\.tiktok\.com/@[^[:space:]]+$')),
  constraint public_profiles_link_soundcloud_chk check (
    link_soundcloud is null or (char_length(link_soundcloud) <= 200 and link_soundcloud ~ '^https://soundcloud\.com/[^[:space:]]+$'))
);

comment on table public.public_profiles is
  'Opt-in public creator profile: social links and one switch per shown item. service_role only.';
comment on column public.public_profiles.blocked is 'Turned off by an administrator. The owner cannot turn it back on.';

create index if not exists public_profiles_live_idx
  on public.public_profiles (updated_at desc)
  where enabled and not blocked;

alter table public.public_profiles enable row level security;
alter table public.public_profiles force row level security;
revoke all on table public.public_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.public_profiles to service_role;

drop policy if exists public_profiles_service_all on public.public_profiles;
create policy public_profiles_service_all
  on public.public_profiles
  for all
  to service_role
  using (true)
  with check (true);

-- One call per list: account ids -> public ids of the profiles that are on.
create or replace function public.public_profile_ids(p_ids uuid[])
returns table (owner_id uuid, public_id text)
language sql
stable
set search_path = ''
as $$
  select pp.owner_id, pp.public_id
  from public.public_profiles pp
  where pp.owner_id = any (p_ids) and pp.enabled and not pp.blocked;
$$;
revoke all on function public.public_profile_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.public_profile_ids(uuid[]) to service_role;

-- Sitemap: profiles that are on and share at least one public beat, sample or finished track.
create or replace function public.public_profile_sitemap(p_limit integer)
returns table (public_id text, display_name text, updated_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select pp.public_id, p.display_name, pp.updated_at
  from public.public_profiles pp
  join public.profiles p on p.id = pp.owner_id
  where pp.enabled
    and not pp.blocked
    and coalesce(btrim(p.display_name), '') <> ''
    and (
      (pp.show_works and exists (
        select 1 from public.catalog_works w
        where w.owner_id = pp.owner_id and w.withdrawn_at is null))
      or (pp.show_beats and exists (
        select 1 from public.beats b
        where b.owner_id = pp.owner_id
          and b.ownership_type = 'USER'
          and b.status = 'PUBLISHED'
          and b.visibility = 'public'
          and b.sold_at is null
          and b.catalog_lane is distinct from 'paid'))
      or (pp.show_samples and p.role <> 'ADMIN' and exists (
        select 1 from public.studio_samples s
        where s.owner_id = pp.owner_id and s.status = 'PUBLISHED' and s.public_listing))
    )
  order by pp.updated_at desc
  limit least(greatest(coalesce(p_limit, 0), 0), 500);
$$;
revoke all on function public.public_profile_sitemap(integer) from public, anon, authenticated;
grant execute on function public.public_profile_sitemap(integer) to service_role;

-- An administrator turning a profile off (or back on) is audited.
alter table public.admin_audit_events drop constraint if exists admin_audit_events_action_chk;
alter table public.admin_audit_events add constraint admin_audit_events_action_chk check (
  action = any (array[
    'ROLE_CHANGE', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'MODERATOR_GRANT', 'MODERATOR_REVOKE',
    'PREMIUM_TIER_CHANGE', 'PREMIUM_EXPIRATION_CHANGE', 'USER_ACCOUNT_DELETE', 'SAMPLE_POLICY_UPDATE',
    'BEAT_METADATA_UPDATE', 'SITE_MAINTENANCE_UPDATE', 'PLAN_ADDON_GRANT', 'PLAN_ADDON_REVOKE',
    'BEAT_COVER_REVIEW', 'BEAT_OWNER_UPDATE', 'USAGE_RESET', 'PAYMENT_REVIEW_RESOLVE',
    'COMMUNITY_COMMENT_HIDE', 'COMMUNITY_REPORT_DISMISS',
    'PUBLIC_PROFILE_BLOCK', 'PUBLIC_PROFILE_UNBLOCK'
  ]::text[])
);
