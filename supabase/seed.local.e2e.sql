-- LOCAL E2E ONLY — BitRymDym BPM Uncertainty
-- DO NOT run against production Supabase.
-- DO NOT include this as a production migration.
--
-- Purpose: document local-only bootstrap notes after `supabase db reset`.
-- Buckets beat-audio / take-audio / audio-artifacts are created by migrations.
-- Auth users must be created via local Auth Admin / Studio (not here),
-- because auth.users is managed by GoTrue.
--
-- After Docker + `supabase start`:
--   1) supabase db reset   (applies migrations locally)
--   2) create local ADMIN + USER in Studio (http://127.0.0.1:54423)
--   3) ensure profiles.role = 'ADMIN' for admin test user
--   4) run BPM upload E2E against http://127.0.0.1:3000 with .env.local.e2e

SELECT 'bitrymdym_local_e2e_seed_marker' AS note;
