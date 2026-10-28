/**
 * Catalog original → private TAKE → Studio clip.
 * Reuses existing POST /api/catalog/copy and POST …/record/place.
 * Does not invent a second place pipeline or catalog URL clip source.
 */

import type { StudioClipDto } from "@/lib/studio/studio-types";

export type CatalogCopyPlaceInput = {
  projectId: string;
  catalogAssetId: string;
  trackId: string;
  timelineStartMs: number;
  expectedDocumentVersion: number;
};

export type CatalogCopyPlaceSuccess = {
  ok: true;
  takeId: string;
  clip: StudioClipDto;
  documentVersion: number;
  reusedExistingCopy: boolean;
  reusedExistingClip: boolean;
  catalogAssetId: string;
};

export type CatalogCopyPlaceFailure = {
  ok: false;
  error: string;
  status: number;
};

export type CatalogCopyPlaceResult =
  | CatalogCopyPlaceSuccess
  | CatalogCopyPlaceFailure;

type FetchLike = typeof fetch;

function readErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { message?: unknown; error?: unknown };
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }
  return fallback;
}

export async function copyCatalogAndPlaceStudioClip(
  input: CatalogCopyPlaceInput,
  fetchImpl: FetchLike = fetch,
): Promise<CatalogCopyPlaceResult> {
  if (!input.projectId || !input.catalogAssetId || !input.trackId) {
    return {
      ok: false,
      status: 400,
      error: "projectId, catalogAssetId i trackId są wymagane.",
    };
  }
  if (!Number.isInteger(input.timelineStartMs) || input.timelineStartMs < 0) {
    return {
      ok: false,
      status: 400,
      error: "timelineStartMs musi być nieujemną liczbą całkowitą.",
    };
  }

  const copyRes = await fetchImpl("/api/catalog/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      catalogAssetId: input.catalogAssetId,
      projectId: input.projectId,
    }),
  });
  const copyBody = (await copyRes.json().catch(() => null)) as {
    takeId?: unknown;
    reusedExisting?: unknown;
    catalogAssetId?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;
  if (!copyRes.ok || typeof copyBody?.takeId !== "string") {
    return {
      ok: false,
      status: copyRes.status || 500,
      error: readErrorMessage(
        copyBody,
        "Nie udało się skopiować sample z katalogu.",
      ),
    };
  }

  const placeRes = await fetchImpl(
    `/api/studio/projects/${input.projectId}/record/place`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: input.trackId,
        takeId: copyBody.takeId,
        timelineStartMs: input.timelineStartMs,
        expectedDocumentVersion: input.expectedDocumentVersion,
      }),
    },
  );
  const placeBody = (await placeRes.json().catch(() => null)) as {
    clip?: StudioClipDto;
    documentVersion?: unknown;
    reusedExisting?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;
  if (!placeRes.ok || !placeBody?.clip) {
    return {
      ok: false,
      status: placeRes.status || 500,
      error: readErrorMessage(
        placeBody,
        "Kopia TAKE jest gotowa, ale nie udało się umieścić klipu w Studio.",
      ),
    };
  }

  return {
    ok: true,
    takeId: copyBody.takeId,
    clip: placeBody.clip,
    documentVersion:
      typeof placeBody.documentVersion === "number"
        ? placeBody.documentVersion
        : input.expectedDocumentVersion,
    reusedExistingCopy: Boolean(copyBody.reusedExisting),
    reusedExistingClip: Boolean(placeBody.reusedExisting),
    catalogAssetId:
      typeof copyBody.catalogAssetId === "string"
        ? copyBody.catalogAssetId
        : input.catalogAssetId,
  };
}
