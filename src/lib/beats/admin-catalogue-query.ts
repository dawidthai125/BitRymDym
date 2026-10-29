/**
 * Admin beat catalogue — URL query parsing, sort whitelist, pagination (no I/O).
 */

import { BEAT_STATUSES, type BeatStatus } from "@/types/domain";

export const ADMIN_BEATS_PAGE_SIZES = [10, 20] as const;
export type AdminBeatsPageSize = (typeof ADMIN_BEATS_PAGE_SIZES)[number];
export const ADMIN_BEATS_DEFAULT_PAGE_SIZE: AdminBeatsPageSize = 20;
export const ADMIN_BEATS_SEARCH_MAX_LENGTH = 80;
export const ADMIN_BEATS_MAX_PAGE = 1000;

/** Public sort key → DB column. Anything outside this map is rejected. */
export const ADMIN_BEATS_SORT_COLUMNS = {
  uploaded: "created_at",
  updated: "updated_at",
  title: "title",
  producer: "producer",
  bpm: "bpm",
  duration: "duration_seconds",
  key: "key",
  genre: "genre",
  status: "status",
} as const;

export type AdminBeatsSortKey = keyof typeof ADMIN_BEATS_SORT_COLUMNS;
export type AdminBeatsSortDir = "asc" | "desc";

export const ADMIN_BEATS_DEFAULT_SORT: AdminBeatsSortKey = "uploaded";
export const ADMIN_BEATS_DEFAULT_DIR: AdminBeatsSortDir = "desc";

export type AdminBeatsQuery = {
  q: string;
  status: BeatStatus | null;
  sort: AdminBeatsSortKey;
  dir: AdminBeatsSortDir;
  page: number;
  size: AdminBeatsPageSize;
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(params: RawParams) {
  return (key: string): string => {
    if (params instanceof URLSearchParams) return params.get(key) ?? "";
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };
}

export function isAdminBeatsSortKey(raw: string): raw is AdminBeatsSortKey {
  return Object.prototype.hasOwnProperty.call(ADMIN_BEATS_SORT_COLUMNS, raw);
}

export function parseAdminBeatsSort(raw: string): AdminBeatsSortKey {
  return isAdminBeatsSortKey(raw) ? raw : ADMIN_BEATS_DEFAULT_SORT;
}

export function parseAdminBeatsDir(raw: string): AdminBeatsSortDir {
  return raw === "asc" || raw === "desc" ? raw : ADMIN_BEATS_DEFAULT_DIR;
}

export function parseAdminBeatsPage(raw: string): number {
  const n = Number.parseInt(raw || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, ADMIN_BEATS_MAX_PAGE);
}

export function parseAdminBeatsPageSize(raw: string): AdminBeatsPageSize {
  const n = Number.parseInt(raw, 10);
  return (ADMIN_BEATS_PAGE_SIZES as readonly number[]).includes(n)
    ? (n as AdminBeatsPageSize)
    : ADMIN_BEATS_DEFAULT_PAGE_SIZE;
}

export function parseAdminBeatsStatus(raw: string): BeatStatus | null {
  return (BEAT_STATUSES as readonly string[]).includes(raw)
    ? (raw as BeatStatus)
    : null;
}

/**
 * Search text is embedded (double-quoted) in a PostgREST `or=(...)` filter, so
 * strip the characters that carry meaning there (`,()"\\`) plus the `*` / `%`
 * wildcards. `_` and apostrophes stay so titles like "Don't" still match.
 */
export function normalizeAdminBeatsSearch(raw: string): string {
  return raw
    .replace(/[,()"\\%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ADMIN_BEATS_SEARCH_MAX_LENGTH);
}

export function parseAdminBeatsQuery(params: RawParams): AdminBeatsQuery {
  const get = getter(params);
  return {
    q: normalizeAdminBeatsSearch(get("q")),
    status: parseAdminBeatsStatus(get("status")),
    sort: parseAdminBeatsSort(get("sort")),
    dir: parseAdminBeatsDir(get("dir")),
    page: parseAdminBeatsPage(get("page")),
    size: parseAdminBeatsPageSize(get("size")),
  };
}

/** Supabase `.range()` bounds (inclusive) for a 1-based page. */
export function adminBeatsRange(page: number, size: number): { from: number; to: number } {
  const from = (Math.max(1, page) - 1) * size;
  return { from, to: from + size - 1 };
}

export function adminBeatsPageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** Builds `/admin/beats?...`, dropping defaults so URLs stay short. */
export function adminBeatsHref(
  query: AdminBeatsQuery,
  patch: Partial<AdminBeatsQuery> = {},
): string {
  const next = { ...query, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.status) p.set("status", next.status);
  if (next.sort !== ADMIN_BEATS_DEFAULT_SORT) p.set("sort", next.sort);
  if (next.dir !== ADMIN_BEATS_DEFAULT_DIR) p.set("dir", next.dir);
  if (next.size !== ADMIN_BEATS_DEFAULT_PAGE_SIZE) p.set("size", String(next.size));
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `/admin/beats?${s}` : "/admin/beats";
}

/** Header click: same column flips direction, new column starts at a sensible default. */
export function adminBeatsToggleSort(
  query: AdminBeatsQuery,
  key: AdminBeatsSortKey,
): Partial<AdminBeatsQuery> {
  if (query.sort === key) {
    return { sort: key, dir: query.dir === "asc" ? "desc" : "asc", page: 1 };
  }
  const textual = key === "title" || key === "producer" || key === "key" || key === "genre" || key === "status";
  return { sort: key, dir: textual ? "asc" : "desc", page: 1 };
}
