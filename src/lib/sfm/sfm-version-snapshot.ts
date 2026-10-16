/**
 * SFM Accept content snapshot — immutable freeze of Studio document at Accept.
 * Reuses STUDIO_EXPORT digest / limit helpers. Not a render job snapshot.
 */

import {
  STUDIO_EXPORT_MAX_SNAPSHOT_BYTES,
  STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION,
} from "@/config/audio-render";
import {
  assertStudioDocumentWithinExportLimits,
  collectStudioExportSourceRefs,
  digestStudioDocument,
} from "@/lib/audio/studio-export-document-snapshot";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";

export const SFM_ACCEPT_SNAPSHOT_KIND = "SFM_ACCEPT" as const;

export type SfmAcceptContentSnapshotV1 = {
  schemaVersion: typeof STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION;
  snapshotKind: typeof SFM_ACCEPT_SNAPSHOT_KIND;
  ownerId: string;
  projectId: string;
  documentVersion: number;
  capturedAt: string;
  documentDigest: string;
  document: StudioProjectDocument;
};

export function buildSfmAcceptContentSnapshot(params: {
  ownerId: string;
  projectId: string;
  documentVersion: number;
  capturedAt: string;
  document: StudioProjectDocument;
}): SfmAcceptContentSnapshotV1 {
  try {
    assertStudioDocumentWithinExportLimits(params.document);
    collectStudioExportSourceRefs(params.document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Studio document.";
    if (/at least one TAKE or BEAT_REF/i.test(message)) {
      throw new SfmDomainError(
        "Session has no TAKE or BEAT_REF sources for finalization.",
        "INVALID_SESSION",
      );
    }
    throw new SfmDomainError(message, "INVALID");
  }

  if (params.document.project.id !== params.projectId) {
    throw new SfmDomainError(
      "Snapshot projectId does not match document.",
      "INVALID",
    );
  }
  if (params.document.project.documentVersion !== params.documentVersion) {
    throw new SfmDomainError(
      "Snapshot documentVersion does not match document.",
      "VERSION_CONFLICT",
    );
  }

  const documentDigest = digestStudioDocument(params.document);
  const snapshot: SfmAcceptContentSnapshotV1 = {
    schemaVersion: STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION,
    snapshotKind: SFM_ACCEPT_SNAPSHOT_KIND,
    ownerId: params.ownerId,
    projectId: params.projectId,
    documentVersion: params.documentVersion,
    capturedAt: params.capturedAt,
    documentDigest,
    document: params.document,
  };

  const encoded = JSON.stringify(snapshot);
  if (Buffer.byteLength(encoded, "utf8") > STUDIO_EXPORT_MAX_SNAPSHOT_BYTES) {
    throw new SfmDomainError(
      `SFM accept snapshot exceeds ${STUDIO_EXPORT_MAX_SNAPSHOT_BYTES} bytes.`,
      "INVALID",
    );
  }

  return snapshot;
}
