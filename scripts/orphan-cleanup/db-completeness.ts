/**
 * Paginated DB fetch with control-count completeness (phase 3 + P1 hardening).
 * Callers inject page/count functions — no production client is created here.
 *
 * Flags:
 * - count_complete: exact control count available and fetched.length matches it
 * - pages_consistent: pages ordered by unique PK, no duplicate/missing PK, page errors absent
 * - snapshot_consistent: membership frozen for the read — NOT proven by this module
 *   (always false here). Concurrent inserts/deletes can still yield equal counts
 *   with different row sets. Bookend recount detects count drift only.
 *
 * Supabase/PostgREST default max_rows is commonly documented as 1000 (NOT VERIFIED
 * for this project's live settings). Successful single .select() is never treated
 * as proof of completeness.
 */

export type DbPageResult<T> = {
  rows: T[];
  error?: string;
};

export type DbCountResult = {
  /** Exact count when available; null means control unavailable → incomplete */
  count: number | null;
  error?: string;
};

export type FetchCompleteTableDeps<T> = {
  /** Inclusive range [from, to] like PostgREST .range — page semantics NOT VERIFIED beyond docs */
  fetchPage: (from: number, to: number) => Promise<DbPageResult<T>>;
  fetchExactCount: () => Promise<DbCountResult>;
  pageSize: number;
  setName: string;
  /** Extract stable unique primary key for duplicate detection across pages. */
  getRowId: (row: T) => string | null | undefined;
  /**
   * Optional second exact count after pages.
   * Mismatch with start count ⇒ fail (count_drift). Match does NOT prove snapshot.
   */
  fetchExactCountBookend?: () => Promise<DbCountResult>;
};

export type CompletenessFlags = {
  count_complete: boolean;
  pages_consistent: boolean;
  /** Always false unless a stronger mechanism is added later. */
  snapshot_consistent: false;
};

export type CompleteTableResult<T> =
  | {
      ok: true;
      rows: T[];
      fetched_row_count: number;
      control_count: number;
      pages_completed: number;
      db_read_complete: true;
      set_name: string;
      count_complete: true;
      pages_consistent: true;
      snapshot_consistent: false;
    }
  | {
      ok: false;
      rows: T[];
      fetched_row_count: number;
      control_count: number | null;
      pages_completed: number;
      db_read_complete: false;
      set_name: string;
      reason: string;
      count_complete: boolean;
      pages_consistent: boolean;
      snapshot_consistent: false;
    };

/**
 * Fetch all rows via explicit pagination and compare to exact count control.
 * Any page/count error, PK anomaly, or mismatch ⇒ ok:false, db_read_complete:false.
 * Never sets snapshot_consistent=true.
 */
export async function fetchCompleteTable<T>(
  deps: FetchCompleteTableDeps<T>,
): Promise<CompleteTableResult<T>> {
  const pageSize = deps.pageSize;
  const snapshot_consistent = false as const;

  if (pageSize < 1) {
    return {
      ok: false,
      rows: [],
      fetched_row_count: 0,
      control_count: null,
      pages_completed: 0,
      db_read_complete: false,
      set_name: deps.setName,
      reason: "invalid_page_size",
      count_complete: false,
      pages_consistent: false,
      snapshot_consistent,
    };
  }

  const countRes = await deps.fetchExactCount();
  if (countRes.error) {
    return {
      ok: false,
      rows: [],
      fetched_row_count: 0,
      control_count: null,
      pages_completed: 0,
      db_read_complete: false,
      set_name: deps.setName,
      reason: `count_error:${deps.setName}`,
      count_complete: false,
      pages_consistent: false,
      snapshot_consistent,
    };
  }
  if (countRes.count == null || !Number.isFinite(countRes.count)) {
    return {
      ok: false,
      rows: [],
      fetched_row_count: 0,
      control_count: null,
      pages_completed: 0,
      db_read_complete: false,
      set_name: deps.setName,
      reason: `count_unavailable:${deps.setName}`,
      count_complete: false,
      pages_consistent: false,
      snapshot_consistent,
    };
  }

  const rows: T[] = [];
  const seenIds = new Set<string>();
  let pagesCompleted = 0;
  let from = 0;
  let pages_consistent = true;

  for (;;) {
    const to = from + pageSize - 1;
    const page = await deps.fetchPage(from, to);
    pagesCompleted += 1;
    if (page.error) {
      return {
        ok: false,
        rows,
        fetched_row_count: rows.length,
        control_count: countRes.count,
        pages_completed: pagesCompleted,
        db_read_complete: false,
        set_name: deps.setName,
        reason: `page_error:${deps.setName}:page=${pagesCompleted}`,
        count_complete: false,
        pages_consistent: false,
        snapshot_consistent,
      };
    }
    if (!Array.isArray(page.rows)) {
      return {
        ok: false,
        rows,
        fetched_row_count: rows.length,
        control_count: countRes.count,
        pages_completed: pagesCompleted,
        db_read_complete: false,
        set_name: deps.setName,
        reason: `rows_missing:${deps.setName}:page=${pagesCompleted}`,
        count_complete: false,
        pages_consistent: false,
        snapshot_consistent,
      };
    }
    const batch = page.rows;
    for (const row of batch) {
      const id = deps.getRowId(row);
      if (id == null || typeof id !== "string" || id.length === 0) {
        pages_consistent = false;
        return {
          ok: false,
          rows,
          fetched_row_count: rows.length,
          control_count: countRes.count,
          pages_completed: pagesCompleted,
          db_read_complete: false,
          set_name: deps.setName,
          reason: `missing_pk:${deps.setName}:page=${pagesCompleted}`,
          count_complete: false,
          pages_consistent: false,
          snapshot_consistent,
        };
      }
      if (seenIds.has(id)) {
        pages_consistent = false;
        return {
          ok: false,
          rows,
          fetched_row_count: rows.length,
          control_count: countRes.count,
          pages_completed: pagesCompleted,
          db_read_complete: false,
          set_name: deps.setName,
          reason: `duplicate_pk:${deps.setName}:page=${pagesCompleted}`,
          count_complete: false,
          pages_consistent: false,
          snapshot_consistent,
        };
      }
      seenIds.add(id);
    }
    rows.push(...batch);
    if (batch.length === 0) break;
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const count_complete = rows.length === countRes.count;
  if (!count_complete) {
    return {
      ok: false,
      rows,
      fetched_row_count: rows.length,
      control_count: countRes.count,
      pages_completed: pagesCompleted,
      db_read_complete: false,
      set_name: deps.setName,
      reason: `count_mismatch:${deps.setName}:fetched=${rows.length}:control=${countRes.count}`,
      count_complete: false,
      pages_consistent,
      snapshot_consistent,
    };
  }

  if (deps.fetchExactCountBookend) {
    const end = await deps.fetchExactCountBookend();
    if (end.error || end.count == null || !Number.isFinite(end.count)) {
      return {
        ok: false,
        rows,
        fetched_row_count: rows.length,
        control_count: countRes.count,
        pages_completed: pagesCompleted,
        db_read_complete: false,
        set_name: deps.setName,
        reason: `bookend_count_unavailable:${deps.setName}`,
        count_complete: false,
        pages_consistent,
        snapshot_consistent,
      };
    }
    if (end.count !== countRes.count) {
      return {
        ok: false,
        rows,
        fetched_row_count: rows.length,
        control_count: countRes.count,
        pages_completed: pagesCompleted,
        db_read_complete: false,
        set_name: deps.setName,
        reason: `count_drift:${deps.setName}:start=${countRes.count}:end=${end.count}`,
        count_complete: false,
        pages_consistent,
        snapshot_consistent,
      };
    }
    // Bookend match detects no count drift only — still not a snapshot proof.
  }

  if (!pages_consistent) {
    return {
      ok: false,
      rows,
      fetched_row_count: rows.length,
      control_count: countRes.count,
      pages_completed: pagesCompleted,
      db_read_complete: false,
      set_name: deps.setName,
      reason: `pages_inconsistent:${deps.setName}`,
      count_complete: true,
      pages_consistent: false,
      snapshot_consistent,
    };
  }

  return {
    ok: true,
    rows,
    fetched_row_count: rows.length,
    control_count: countRes.count,
    pages_completed: pagesCompleted,
    db_read_complete: true,
    set_name: deps.setName,
    count_complete: true,
    pages_consistent: true,
    snapshot_consistent,
  };
}

export const CLASSIFY_DB_SET_NAMES = [
  "beat_audio_assets",
  "beats",
  "takes",
  "studio_clips",
  "studio_projects",
  "audio_artifacts",
] as const;

export type ClassifyDbSetName = (typeof CLASSIFY_DB_SET_NAMES)[number];

export type MultiSetCompletenessReport = {
  db_read_complete: boolean;
  count_complete: boolean;
  pages_consistent: boolean;
  snapshot_consistent: false;
  sets: Array<{
    set_name: string;
    db_read_complete: boolean;
    count_complete: boolean;
    pages_consistent: boolean;
    snapshot_consistent: false;
    fetched_row_count: number;
    control_count: number | null;
    pages_completed: number;
    reason?: string;
  }>;
};

export async function fetchAllClassifySetsComplete<TMap extends Record<
  ClassifyDbSetName,
  unknown
>>(deps: {
  pageSize: number;
  fetchers: {
    [K in ClassifyDbSetName]: {
      fetchPage: (
        from: number,
        to: number,
      ) => Promise<DbPageResult<TMap[K]>>;
      fetchExactCount: () => Promise<DbCountResult>;
      getRowId: (row: TMap[K]) => string | null | undefined;
      fetchExactCountBookend?: () => Promise<DbCountResult>;
    };
  };
}): Promise<{
  report: MultiSetCompletenessReport;
  data: Partial<{ [K in ClassifyDbSetName]: TMap[K][] }>;
}> {
  const sets: MultiSetCompletenessReport["sets"] = [];
  const data: Partial<{ [K in ClassifyDbSetName]: TMap[K][] }> = {};
  let allOk = true;
  let allCount = true;
  let allPages = true;

  for (const name of CLASSIFY_DB_SET_NAMES) {
    const f = deps.fetchers[name];
    const result = await fetchCompleteTable<TMap[typeof name]>({
      setName: name,
      pageSize: deps.pageSize,
      fetchPage: f.fetchPage,
      fetchExactCount: f.fetchExactCount,
      getRowId: f.getRowId,
      fetchExactCountBookend: f.fetchExactCountBookend,
    });
    sets.push({
      set_name: name,
      db_read_complete: result.db_read_complete,
      count_complete: result.count_complete,
      pages_consistent: result.pages_consistent,
      snapshot_consistent: false,
      fetched_row_count: result.fetched_row_count,
      control_count: result.control_count,
      pages_completed: result.pages_completed,
      ...(result.ok ? {} : { reason: result.reason }),
    });
    if (!result.ok) {
      allOk = false;
      if (!result.count_complete) allCount = false;
      if (!result.pages_consistent) allPages = false;
    } else {
      data[name] = result.rows;
    }
  }

  return {
    report: {
      db_read_complete: allOk,
      count_complete: allOk && allCount,
      pages_consistent: allOk && allPages,
      snapshot_consistent: false,
      sets,
    },
    data,
  };
}
