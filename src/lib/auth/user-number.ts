import "server-only";

import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import { PROFILE_SELECT_ADMIN_IDENTITY } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileIdentity = {
  id: string;
  displayName: string | null;
  userNumber: number | null;
};

/**
 * ADMIN-only lookup of profile identities (includes user_number).
 * MODERATOR / USER / ANON must not receive foreign user_number via this helper.
 */
export async function loadAdminProfileIdentities(
  userIds: readonly string[],
): Promise<Map<string, ProfileIdentity>> {
  const context = await getCurrentProfile();
  if (!context || context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Admin identity lookup required.");
  }

  const unique = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, ProfileIdentity>();
  if (unique.length === 0) return out;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_ADMIN_IDENTITY)
    .in("id", unique);

  if (error) {
    throw new Error(`Failed to load profile identities: ${error.message}`);
  }

  for (const row of data ?? []) {
    out.set(row.id as string, {
      id: row.id as string,
      displayName: (row.display_name as string | null) ?? null,
      userNumber:
        row.user_number === null || row.user_number === undefined
          ? null
          : Number(row.user_number),
    });
  }
  return out;
}
