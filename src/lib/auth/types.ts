import type { AccountLevel, SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

export type AppProfile = {
  id: string;
  displayName: string | null;
  /** Stable operational ID; null for KEEP users without assignment (e.g. Tajski). */
  userNumber: number | null;
  role: SystemRole;
  accountLevel: AccountLevel;
  /** Creator Progress W1 — derived experience cache. Not Account Level. */
  experienceTotal: number;
  createdAt: string;
  updatedAt: string;
};

export type AuthContext = {
  userId: string;
  email: string | null;
  profile: AppProfile;
  permissions: PermissionKey[];
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  user_number: number | null;
  role: SystemRole;
  account_level: AccountLevel;
  experience_total: number;
  created_at: string;
  updated_at: string;
};

/** Whitelisted profile columns — never select('*') (user_number leakage risk). */
export const PROFILE_SELECT_OWN =
  "id, display_name, user_number, role, account_level, experience_total, created_at, updated_at" as const;

/** Admin lookup of another profile's display + number (RLS: own OR is_admin). */
export const PROFILE_SELECT_ADMIN_IDENTITY =
  "id, display_name, user_number" as const;

export function mapProfileRow(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    userNumber:
      row.user_number === null || row.user_number === undefined
        ? null
        : Number(row.user_number),
    role: row.role,
    accountLevel: row.account_level,
    experienceTotal:
      typeof row.experience_total === "number" &&
      Number.isFinite(row.experience_total)
        ? Math.max(0, Math.floor(row.experience_total))
        : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Account / admin label: "Dawid (ID: 1)" or bare name when no number. */
export function formatProfileWithUserNumber(
  displayName: string | null | undefined,
  userNumber: number | null | undefined,
): string {
  const name = (displayName ?? "").trim() || "Użytkownik";
  if (userNumber === null || userNumber === undefined) {
    return name;
  }
  return `${name} (ID: ${userNumber})`;
}
