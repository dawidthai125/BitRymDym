import { createClient } from "@supabase/supabase-js";
import "server-only";

import {
  getSupabasePublicEnv,
  getSupabaseServiceRoleKey,
} from "@/lib/supabase/env";

/**
 * Admin / elevated server client using the service role key.
 * NEVER import into Client Components.
 * Not used in Phase 1.2 business flows — scaffold only.
 */
export function createSupabaseAdminClient() {
  const { url, isConfigured } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!isConfigured || !url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
