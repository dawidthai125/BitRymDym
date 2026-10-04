/**
 * W1 Admin users list — query parsing only (no I/O).
 */

import { CREATOR_RANKS, type CreatorRank } from "@/types/creator-progress";
import { SYSTEM_ROLES, type SystemRole } from "@/types/domain";
import { PREMIUM_TIERS, type PremiumTier } from "@/types/premium";

export const ADMIN_USERS_PAGE_SIZE = 25;
export const ADMIN_USERS_MAX_SCAN = 500;
export const ADMIN_USERS_SEARCH_MAX_LENGTH = 80;

export type AdminUsersQuery = {
  q: string;
  role: SystemRole | null;
  premium: PremiumTier | null;
  rank: CreatorRank | null;
  page: number;
};

export function normalizeAdminUsersSearch(raw: string): string {
  return raw.trim().slice(0, ADMIN_USERS_SEARCH_MAX_LENGTH);
}

export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function parseAdminUsersPage(raw: string | null | undefined): number {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

function parseRole(raw: string | null | undefined): SystemRole | null {
  if (!raw || raw === "all") return null;
  return (SYSTEM_ROLES as readonly string[]).includes(raw)
    ? (raw as SystemRole)
    : null;
}

function parsePremium(raw: string | null | undefined): PremiumTier | null {
  if (!raw || raw === "all") return null;
  return (PREMIUM_TIERS as readonly string[]).includes(raw)
    ? (raw as PremiumTier)
    : null;
}

function parseRank(raw: string | null | undefined): CreatorRank | null {
  if (!raw || raw === "all") return null;
  return (CREATOR_RANKS as readonly string[]).includes(raw)
    ? (raw as CreatorRank)
    : null;
}

export function parseAdminUsersQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): AdminUsersQuery {
  const get = (key: string): string => {
    if (params instanceof URLSearchParams) {
      return params.get(key) ?? "";
    }
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  return {
    q: normalizeAdminUsersSearch(get("q")),
    role: parseRole(get("role")),
    premium: parsePremium(get("premium")),
    rank: parseRank(get("rank")),
    page: parseAdminUsersPage(get("page")),
  };
}

export function isDigitsUserNumberQuery(q: string): boolean {
  return /^\d{1,18}$/.test(q);
}

export function looksLikeEmailQuery(q: string): boolean {
  return q.includes("@");
}

export function paginateSlice<T>(
  rows: readonly T[],
  page: number,
  pageSize: number = ADMIN_USERS_PAGE_SIZE,
): { rows: T[]; total: number; page: number; pageCount: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize) as T[],
    total,
    page: safePage,
    pageCount,
  };
}
