import { applyIntegrationEnv, resolveIntegrationEnv } from "@/test/integration-env";

// `vitest.integration.config.ts` is an explicit request to hit the local stack:
// a missing opt-in fails every file instead of reporting skips as a green run.
const env = resolveIntegrationEnv();
if (!env.enabled) {
  throw new Error(`[integration-env] ${env.reason}`);
}
// Before any test module loads, so app code reading NEXT_PUBLIC_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY at import time already sees the local stack.
applyIntegrationEnv(env);
