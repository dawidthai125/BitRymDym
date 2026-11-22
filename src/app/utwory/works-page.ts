/** /utwory paging (?strona=N, 1-based). Pure. */
export const WORKS_PAGE_SIZE = 24;
/** Deep pages beyond this are clamped (offset scans stay cheap). */
export const WORKS_MAX_PAGE = 200;

export function worksPageOf(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,4}$/.test(value)) return 1;
  const n = Number(value);
  return n >= 1 ? Math.min(n, WORKS_MAX_PAGE) : 1;
}

export function worksPageHref(page: number): string {
  return page > 1 ? `/utwory?strona=${page}` : "/utwory";
}
