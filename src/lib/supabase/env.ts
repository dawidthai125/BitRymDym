import "server-only";

/**
 * Server-only env helpers.
 * Never import this module from Client Components.
 * FRONTEND ≠ SECURITY BOUNDARY.
 */

export type SupabasePublicEnv = {
  url: string | undefined;
  anonKey: string | undefined;
  isConfigured: boolean;
};

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
}

/** Service role key — server only. Never expose to the client. */
export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
