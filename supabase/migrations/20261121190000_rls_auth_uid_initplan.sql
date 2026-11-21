-- Performance advisor 0003 auth_rls_initplan (2026-11-21): evaluate auth.uid() once per query,
-- not once per row. Same access rules — only auth.uid() becomes (select auth.uid()).
-- Idempotent (ALTER POLICY on existing policies).

alter policy beats_select_own on public.beats
  using (owner_id = (select auth.uid()));

alter policy plan_addon_entitlements_select_own on public.plan_addon_entitlements
  using (user_id = (select auth.uid()));

alter policy profiles_select_own_or_admin on public.profiles
  using ((id = (select auth.uid())) or public.is_admin());

alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy studio_download_usage_select_own on public.studio_download_usage
  using (owner_id = (select auth.uid()));

alter policy studio_engineer_requests_insert_own on public.studio_engineer_requests
  with check ((select auth.uid()) = owner_id);

alter policy studio_engineer_requests_select_own on public.studio_engineer_requests
  using ((select auth.uid()) = owner_id);

alter policy studio_master_jobs_select_own on public.studio_master_jobs
  using (owner_id = (select auth.uid()));

alter policy studio_master_references_select_own on public.studio_master_references
  using (owner_id = (select auth.uid()));

alter policy studio_song_completions_select_own on public.studio_song_completions
  using (owner_id = (select auth.uid()));

alter policy take_download_events_select_own on public.take_download_events
  using (user_id = (select auth.uid()));
