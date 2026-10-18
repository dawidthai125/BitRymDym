/**
 * Tests that create real Supabase/Postgres data. Excluded from the default
 * `vitest run`; run only via `vitest.integration.config.ts` against the local
 * stack (README.md, section "Testy"). Every file must gate on `resolveIntegrationEnv`.
 */
export const INTEGRATION_TEST_FILES = [
  "src/lib/auth/profile-privilege-hardening-local.test.ts",
  "src/lib/beats/beat-master-finalize-local.test.ts",
  "src/lib/beats/community-wave2-e2e.test.ts",
  "src/lib/beats/community-wave3-live.test.ts",
  "src/lib/beats/community-wave4-live.test.ts",
  "src/lib/beats/community-wave5-live.test.ts",
  "src/lib/grants/wave5-live.test.ts",
  "src/lib/takes/d02-live.test.ts",
  "src/lib/takes/p2-replace-live.test.ts",
  "src/lib/takes/p3-claim-live.test.ts",
  "src/lib/takes/p4-live-verify.test.ts",
  "src/lib/takes/stu16-pending-upload-window-live.test.ts",
  "src/lib/takes/wave1-live.test.ts",
  "src/lib/takes/wave2-live.test.ts",
  "src/lib/takes/wave3-live.test.ts",
  "src/lib/takes/wave4-live.test.ts",
] as const;
