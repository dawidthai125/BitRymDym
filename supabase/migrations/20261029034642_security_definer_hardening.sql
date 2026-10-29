-- Security hardening for Supabase advisor findings (2026-10-29).
-- Decisions were made against the production catalog (pg_policies, pg_trigger, pg_proc) and app code:
--
-- 1) public.prevent_user_number_mutation() — trigger function (profiles_prevent_user_number_mutation).
--    It is never called via RPC. PostgreSQL checks trigger-function EXECUTE only at CREATE TRIGGER time,
--    so revoking from PUBLIC/anon/authenticated does not affect the trigger. → REVOKE.
--
-- 2) public.is_admin(), public.is_moderator(), public.is_staff() — KEEP EXECUTE for authenticated.
--    They are used in RLS policies (TO authenticated) on beats, beat_audio_assets and profiles,
--    and policies run as the calling role. anon already has no EXECUTE.
--
-- 3) public.public_author_display_names(uuid[]) — KEEP anon + authenticated.
--    Called via supabase.rpc from src/lib/beats/public-author.ts with the session client,
--    including for logged-out visitors of the public catalog. It returns display names only.
--
-- 4) search_path on 3 non-DEFINER helpers flagged as role-mutable. Their bodies use only
--    built-ins (jsonb_typeof, jsonb_object_keys, CASE), which pg_catalog always resolves → search_path = ''.

revoke execute on function public.prevent_user_number_mutation() from public, anon, authenticated;

alter function public.sfm_executor_kind_for_stage(text) set search_path = '';
alter function public.studio_mix_working_assert_track_patch(jsonb) set search_path = '';
alter function public.studio_mix_working_assert_master_patch(jsonb) set search_path = '';
