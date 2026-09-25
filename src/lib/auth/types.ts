import type { AccountLevel, SystemRole } from "@/types/domain";
import type { PermissionKey } from "@/types/permissions";

export type AppProfile = {
  id: string;
  displayName: string | null;
  role: SystemRole;
  accountLevel: AccountLevel;
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
  role: SystemRole;
  account_level: AccountLevel;
  created_at: string;
  updated_at: string;
};

export function mapProfileRow(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    accountLevel: row.account_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
