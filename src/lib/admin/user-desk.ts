import "server-only";

import { assembleAdminUserRow, type AdminUserRow } from "@/lib/admin/users-assemble";
import { requireAdminUsersListAccess } from "@/lib/admin/users-list";
import type { PremiumEntitlementSnapshot } from "@/lib/audio/effective-entitlement";
import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";
import type { AccountLevel, SystemRole } from "@/types/domain";

export type AdminUserDesk = {
  user: AdminUserRow;
  isSelf: boolean;
  projects: { id: string; title: string | null; status: string | null; updatedAt: string | null }[];
  beats: { id: string; title: string | null; status: string | null; ownershipType: string | null }[];
  takes: { id: string; title: string | null; status: string | null; createdAt: string | null }[];
  exports: { id: string; kind: string | null; status: string | null; createdAt: string | null }[];
};

export async function loadAdminUserDesk(userId: string): Promise<AdminUserDesk | null> {
  const viewer = await requireAdminUsersListAccess();
  if (!isUuid(userId)) return null;
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, display_name, user_number, role, account_level, experience_total")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return null;

  const authUser = await admin.auth.admin.getUserById(userId);
  const email = authUser.data.user?.email ?? null;

  const { data: entitlementRows } = await admin
    .from("premium_entitlements")
    .select("user_id, active, source, expires_at, tier")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  const ent = entitlementRows?.[0];
  const premium: PremiumEntitlementSnapshot | null = ent
    ? {
        userId,
        active: Boolean(ent.active),
        source: String(ent.source ?? ""),
        expiresAt: typeof ent.expires_at === "string" ? ent.expires_at : null,
        tier: isPremiumTier(ent.tier) ? ent.tier : null,
      }
    : null;

  const user = assembleAdminUserRow({
    profile: {
      id: profile.id as string,
      displayName: (profile.display_name as string | null) ?? null,
      userNumber: profile.user_number == null ? null : Number(profile.user_number),
      role: profile.role as SystemRole,
      accountLevel: profile.account_level as AccountLevel,
      experienceTotal: Number(profile.experience_total ?? 0),
    },
    premium,
    email,
  });

  const [projects, beats, takes, exports] = await Promise.all([
    admin.from("studio_projects").select("id, title, status, updated_at").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(40),
    admin.from("beats").select("id, title, status, ownership_type").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(40),
    admin.from("takes").select("id, title, status, created_at").eq("owner_id", userId).eq("is_stem", false).order("created_at", { ascending: false }).limit(20),
    admin.from("studio_master_jobs").select("id, kind, status, created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const rows = <T,>(res: { data: T[] | null; error: { message: string } | null }) => (res.error ? [] : res.data ?? []);
  return {
    user,
    isSelf: viewer.userId === userId,
    projects: rows(projects).map((row) => ({
      id: String((row as { id: string }).id),
      title: ((row as { title?: string | null }).title) ?? null,
      status: ((row as { status?: string | null }).status) ?? null,
      updatedAt: ((row as { updated_at?: string | null }).updated_at) ?? null,
    })),
    beats: rows(beats).map((row) => ({
      id: String((row as { id: string }).id),
      title: ((row as { title?: string | null }).title) ?? null,
      status: ((row as { status?: string | null }).status) ?? null,
      ownershipType: ((row as { ownership_type?: string | null }).ownership_type) ?? null,
    })),
    takes: rows(takes).map((row) => ({
      id: String((row as { id: string }).id),
      title: ((row as { title?: string | null }).title) ?? null,
      status: ((row as { status?: string | null }).status) ?? null,
      createdAt: ((row as { created_at?: string | null }).created_at) ?? null,
    })),
    exports: rows(exports).map((row) => ({
      id: String((row as { id: string }).id),
      kind: ((row as { kind?: string | null }).kind) ?? null,
      status: ((row as { status?: string | null }).status) ?? null,
      createdAt: ((row as { created_at?: string | null }).created_at) ?? null,
    })),
  };
}
