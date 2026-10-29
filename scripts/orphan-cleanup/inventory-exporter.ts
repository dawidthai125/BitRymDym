/**
 * Testable beat-audio inventory exporter (phase 2 + P1 pagination hardening).
 * Does not call production Storage unless a caller injects a live listPage —
 * phases 2–3 tests must inject mocks only. Never removes/updates Storage objects.
 *
 * Completeness under concurrent Storage writes remains NOT VERIFIED — stable
 * sortBy is required for offset pagination but is not a snapshot proof.
 */
import {
  buildInventoryDocument,
  inventorySummaryForLog,
  type OrphanInventoryDocument,
  type OrphanInventoryObject,
  ORPHAN_INVENTORY_BUCKET,
} from "./inventory-contract";

/** Deterministic Storage list sort — matches documented supabase-js list({ sortBy }). */
export type InventoryListSortBy = {
  column: "name";
  order: "asc";
};

export const REQUIRED_INVENTORY_SORT_BY: InventoryListSortBy = {
  column: "name",
  order: "asc",
};

export type InventoryListItem = {
  /** Basename within the listed prefix */
  name: string;
  isFolder: boolean;
  /** Absolute object key when this is a file under beat-audio */
  objectKey?: string;
  sizeBytes?: number | null;
  createdAt?: string | null;
};

export type InventoryListPageResult = {
  /** Required on success — missing/non-array is fail-closed (not EOF). */
  items?: InventoryListItem[] | null;
  error?: string;
  /** Echo of sort applied by the adapter; must match required sortBy. */
  sortByApplied?: InventoryListSortBy;
};

/**
 * Injected lister. Pagination: limit+offset with required sortBy.
 * Project-specific Storage ceilings / concurrent-write correctness: NOT VERIFIED.
 */
export type InventoryExporterDeps = {
  listPage: (args: {
    prefix: string;
    limit: number;
    offset: number;
    sortBy: InventoryListSortBy;
  }) => Promise<InventoryListPageResult>;
  pageSize: number;
  environmentId: string;
  /**
   * Declared mechanism stored on the document.
   * Should mention limit+offset+sortBy and NOT VERIFIED for concurrent writes.
   */
  paginationMechanism: string;
  /** Fixed sort required on every page (default: name asc). */
  requiredSortBy?: InventoryListSortBy;
  now?: () => Date;
  /** Optional abort signal between pages */
  shouldAbort?: () => boolean;
};

export type InventoryExportResult = {
  document: OrphanInventoryDocument;
  /** Safe for stdout — no object paths */
  summary: Record<string, unknown>;
  /** true only when listing_status === complete */
  acceptableForFinalClassify: boolean;
};

function joinKey(prefix: string, name: string): string {
  if (!prefix) return name;
  return prefix.endsWith("/") ? `${prefix}${name}` : `${prefix}/${name}`;
}

function sortByEqual(
  a: InventoryListSortBy | undefined,
  b: InventoryListSortBy,
): boolean {
  return (
    a != null &&
    a.column === b.column &&
    a.order === b.order
  );
}

/**
 * BFS over folder prefixes using injected listPage.
 * On any page error, validation failure, or abort: returns diagnostic
 * incomplete/failed document — never listing_status=complete.
 */
export async function exportBeatAudioInventory(
  deps: InventoryExporterDeps,
): Promise<InventoryExportResult> {
  const now = deps.now ?? (() => new Date());
  const started = now().toISOString();
  const pageSize = deps.pageSize;
  const requiredSortBy = deps.requiredSortBy ?? REQUIRED_INVENTORY_SORT_BY;
  if (pageSize < 1) {
    throw new Error("inventory export aborted: pageSize must be >= 1");
  }

  const objects: OrphanInventoryObject[] = [];
  const seenKeys = new Set<string>();
  let pagesCompleted = 0;
  const queue: string[] = [""];
  const visitedPrefixes = new Set<string>();
  /** Prefixes already queued or visited — prevents unbounded re-enqueue under offset drift. */
  const scheduledPrefixes = new Set<string>([""]);

  const fail = (
    status: "incomplete" | "failed",
    reason: string,
  ): InventoryExportResult => {
    const finished = now().toISOString();
    const document = buildInventoryDocument({
      environmentId: deps.environmentId,
      listingStatus: status,
      listingStartedAt: started,
      listingFinishedAt: finished,
      pageSize,
      pagesCompleted,
      paginationMechanism: deps.paginationMechanism,
      endCondition: null,
      objects: [...objects],
      diagnosticOnly: true,
      failureReason: reason,
    });
    return {
      document,
      summary: inventorySummaryForLog(document),
      acceptableForFinalClassify: false,
    };
  };

  while (queue.length > 0) {
    if (deps.shouldAbort?.()) {
      return fail("incomplete", "export aborted by shouldAbort");
    }
    const prefix = queue.shift()!;
    if (visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);

    let offset = 0;
    for (;;) {
      if (deps.shouldAbort?.()) {
        return fail("incomplete", "export aborted by shouldAbort");
      }

      let page: InventoryListPageResult;
      try {
        page = await deps.listPage({
          prefix,
          limit: pageSize,
          offset,
          sortBy: requiredSortBy,
        });
      } catch {
        return fail(
          "failed",
          `listPage_throw pages_completed=${pagesCompleted}`,
        );
      }

      if (page.error) {
        return fail(
          "failed",
          `listPage error at prefix_digest_scope pages_completed=${pagesCompleted}`,
        );
      }

      if (!Array.isArray(page.items)) {
        return fail(
          "failed",
          `items_missing pages_completed=${pagesCompleted}`,
        );
      }

      if (!sortByEqual(page.sortByApplied, requiredSortBy)) {
        return fail(
          "failed",
          `sortBy_mismatch pages_completed=${pagesCompleted}`,
        );
      }

      pagesCompleted += 1;
      const items = page.items;

      if (items.length === 0) {
        break;
      }

      let newObjectKeys = 0;
      let newFolderPrefixes = 0;

      for (const item of items) {
        if (item == null || typeof item !== "object") {
          return fail(
            "failed",
            `bad_record pages_completed=${pagesCompleted}`,
          );
        }
        if (typeof item.name !== "string" || item.name.length === 0) {
          return fail(
            "failed",
            `bad_record pages_completed=${pagesCompleted}`,
          );
        }
        if (typeof item.isFolder !== "boolean") {
          return fail(
            "failed",
            `bad_record pages_completed=${pagesCompleted}`,
          );
        }

        if (item.isFolder) {
          const childPrefix = joinKey(prefix, item.name);
          if (!scheduledPrefixes.has(childPrefix)) {
            scheduledPrefixes.add(childPrefix);
            queue.push(childPrefix);
            newFolderPrefixes += 1;
          }
          continue;
        }

        const objectKey =
          typeof item.objectKey === "string" && item.objectKey.length > 0
            ? item.objectKey
            : joinKey(prefix, item.name);
        if (!objectKey || typeof objectKey !== "string") {
          return fail(
            "failed",
            `bad_record pages_completed=${pagesCompleted}`,
          );
        }
        if (seenKeys.has(objectKey)) {
          return fail(
            "failed",
            `duplicate_key pages_completed=${pagesCompleted}`,
          );
        }
        seenKeys.add(objectKey);
        newObjectKeys += 1;
        objects.push({
          object_path: objectKey,
          size_bytes:
            item.sizeBytes === undefined ? null : item.sizeBytes,
          created_at:
            item.createdAt === undefined ? null : item.createdAt,
        });
      }

      if (items.length === pageSize && newObjectKeys === 0 && newFolderPrefixes === 0) {
        return fail(
          "failed",
          `full_page_zero_new_keys pages_completed=${pagesCompleted}`,
        );
      }

      if (items.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  const finished = now().toISOString();
  const document = buildInventoryDocument({
    environmentId: deps.environmentId,
    listingStatus: "complete",
    listingStartedAt: started,
    listingFinishedAt: finished,
    pageSize,
    pagesCompleted,
    paginationMechanism: deps.paginationMechanism,
    endCondition:
      "empty_or_short_page_all_prefixes_with_stable_sortBy_name_asc",
    objects,
  });

  if (document.objects_accumulated !== document.objects.length) {
    return fail("failed", "post-build objects_accumulated mismatch");
  }

  return {
    document,
    summary: inventorySummaryForLog(document),
    acceptableForFinalClassify: true,
  };
}

export function inventoryBucket(): string {
  return ORPHAN_INVENTORY_BUCKET;
}

/** Recommended pagination_mechanism string for callers (local or future prod adapter). */
export function defaultInventoryPaginationMechanism(): string {
  return (
    "storage.list limit+offset sortBy=name:asc; " +
    "recursive BFS local; concurrent-write completeness NOT VERIFIED"
  );
}
