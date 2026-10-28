/**
 * Mix Working Plane — snapshot + digest (pure).
 * Reuses canonical export digest / limit helpers. No alternate digest.
 */

import { STUDIO_EXPORT_MAX_SNAPSHOT_BYTES } from "@/config/audio-render";
import {
  assertStudioDocumentWithinExportLimits,
  digestStudioDocument,
} from "@/lib/audio/studio-export-document-snapshot";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  MIX_WORKING_SNAPSHOT_KIND,
  MixWorkingDomainError,
  type MixWorkingSnapshotV1,
} from "@/lib/studio/mix-working/mix-working-types";

/** Deep-clone via JSON so the tip document is never mutated by snapshot holders. */
export function cloneStudioProjectDocument(
  document: StudioProjectDocument,
): StudioProjectDocument {
  return JSON.parse(JSON.stringify(document)) as StudioProjectDocument;
}

/**
 * Same byte-limit contract as studio export snapshot builder:
 * JSON.stringify(envelope) UTF-8 size ≤ STUDIO_EXPORT_MAX_SNAPSHOT_BYTES.
 */
export function assertMixWorkingSnapshotWithinByteLimit(
  snapshot: MixWorkingSnapshotV1,
): void {
  const encoded = JSON.stringify(snapshot);
  if (Buffer.byteLength(encoded, "utf8") > STUDIO_EXPORT_MAX_SNAPSHOT_BYTES) {
    throw new MixWorkingDomainError(
      "LIMIT",
      `Mix Working snapshot exceeds ${STUDIO_EXPORT_MAX_SNAPSHOT_BYTES} bytes.`,
    );
  }
}

/**
 * Build an immutable Working Plane snapshot of the tip document.
 * Does not modify `document`. Does not invent digests.
 */
export function buildMixWorkingSnapshot(params: {
  ownerId: string;
  projectId: string;
  document: StudioProjectDocument;
  /** Caller-supplied ISO timestamp — pure functions must not call Date.now(). */
  capturedAt: string;
}): MixWorkingSnapshotV1 {
  if (!params.ownerId || !params.projectId) {
    throw new MixWorkingDomainError("INVALID", "ownerId and projectId required.");
  }
  if (
    typeof params.capturedAt !== "string" ||
    params.capturedAt.length < 1
  ) {
    throw new MixWorkingDomainError("INVALID", "capturedAt required.");
  }
  if (params.document.project.id !== params.projectId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Snapshot projectId does not match document.project.id.",
    );
  }

  try {
    assertStudioDocumentWithinExportLimits(params.document);
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      throw new MixWorkingDomainError("LIMIT", error.message);
    }
    throw error;
  }

  const document = cloneStudioProjectDocument(params.document);
  const documentDigest = digestStudioDocument(document);

  const snapshot: MixWorkingSnapshotV1 = {
    snapshotKind: MIX_WORKING_SNAPSHOT_KIND,
    ownerId: params.ownerId,
    projectId: params.projectId,
    sourceDocumentVersion: document.project.documentVersion,
    documentDigest,
    capturedAt: params.capturedAt,
    document,
  };

  assertMixWorkingSnapshotWithinByteLimit(snapshot);
  return snapshot;
}

/** Re-export for callers that need the same canonical digest. */
export function digestMixWorkingDocument(
  document: StudioProjectDocument,
): string {
  return digestStudioDocument(document);
}
