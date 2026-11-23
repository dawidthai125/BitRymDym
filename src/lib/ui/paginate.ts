/** Catalogue paging, 20 rows per page (owner decision 2026-11-23). Pure, client-safe. */
export const CATALOG_PAGE_SIZE = 20;
export const CATALOG_PAGE_PARAM = "strona";

export function parseCatalogPage(raw: string | string[] | null | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

export function pageCount(total: number, size = CATALOG_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Rows of one page; a page past the end shows the last one. */
export function paginate<T>(rows: readonly T[], page: number, size = CATALOG_PAGE_SIZE): { page: number; pages: number; rows: T[] } {
  const pages = pageCount(rows.length, size);
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, rows: rows.slice((current - 1) * size, current * size) };
}

/** Page (1-based) that holds the row, null when it is not listed. */
export function pageOfRow<T extends { id: string }>(rows: readonly T[], id: string, size = CATALOG_PAGE_SIZE): number | null {
  const index = rows.findIndex((r) => r.id === id);
  return index < 0 ? null : Math.floor(index / size) + 1;
}

/** "?katalog=platny&strona=2"; page 1 has no parameter. */
export function catalogPageHref(query: string, page: number): string {
  const params = new URLSearchParams(query);
  params.delete(CATALOG_PAGE_PARAM);
  if (page > 1) params.set(CATALOG_PAGE_PARAM, String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

/** 1 … 4 [5] 6 … 12 (0 = gap). */
export function pagerItems(page: number, pages: number): number[] {
  const shown = [1, page - 1, page, page + 1, pages].filter((p, i, all) => p >= 1 && p <= pages && all.indexOf(p) === i).sort((a, b) => a - b);
  return shown.flatMap((p, i) => (i > 0 && p - shown[i - 1]! > 1 ? [0, p] : [p]));
}
