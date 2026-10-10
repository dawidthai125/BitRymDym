/**
 * STUDIO_EXPORT Stage B — immutable document snapshot contract (pure, no I/O).
 * Source IDs inside the document are NOT AuthZ proof.
 */

import { createHash } from "node:crypto";

import {
  STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION,
  STUDIO_EXPORT_MAX_CLIPS,
  STUDIO_EXPORT_MAX_SNAPSHOT_BYTES,
  STUDIO_EXPORT_MAX_TRACKS,
  STUDIO_EXPORT_MAX_UNIQUE_BEATS,
  STUDIO_EXPORT_MAX_UNIQUE_TAKES,
} from "@/config/audio-render";
import { beatRefMatchesProjectSsot } from "@/lib/studio/studio-beat-audio";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

export const STUDIO_EXPORT_SNAPSHOT_FORBIDDEN_KEYS = [
  "objectKey",
  "object_key",
  "signedUrl",
  "signed_url",
  "url",
  "storagePath",
  "storage_path",
  "storageBucket",
  "storage_bucket",
  "token",
  "secret",
] as const;

export type StudioExportDocumentSnapshotV1 = {
  schemaVersion: typeof STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION;
  jobId: string;
  ownerId: string;
  projectId: string;
  documentVersion: number;
  capturedAt: string;
  documentDigest: string;
  document: StudioProjectDocument;
};

export type StudioExportSourceRefs = {
  takeIds: string[];
  beatIds: string[];
};

/** Deterministic JSON for digests (sorted object keys; arrays preserve order). */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`,
    )
    .join(",")}}`;
}

export function digestStudioDocument(document: StudioProjectDocument): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(document), "utf8")
    .digest("hex");
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (
      (STUDIO_EXPORT_SNAPSHOT_FORBIDDEN_KEYS as readonly string[]).includes(key)
    ) {
      throw new RenderJobDomainError(
        `Snapshot must not contain ${key} at ${path}.`,
        "FORBIDDEN",
      );
    }
    assertNoForbiddenKeys(record[key], `${path}.${key}`);
  }
}

export function assertStudioDocumentWithinExportLimits(
  document: StudioProjectDocument,
): void {
  if (document.tracks.length > STUDIO_EXPORT_MAX_TRACKS) {
    throw new RenderJobDomainError(
      `Studio export exceeds max tracks (${STUDIO_EXPORT_MAX_TRACKS}).`,
      "LIMIT",
    );
  }
  if (document.clips.length > STUDIO_EXPORT_MAX_CLIPS) {
    throw new RenderJobDomainError(
      `Studio export exceeds max clips (${STUDIO_EXPORT_MAX_CLIPS}).`,
      "LIMIT",
    );
  }
}

/**
 * Collect unique TAKE / BEAT_REF ids from a canonical Studio document.
 * ARTIFACT clips are ignored (AC-05). BEAT_REF must match project beat SSOT.
 */
export function collectStudioExportSourceRefs(
  document: StudioProjectDocument,
): StudioExportSourceRefs {
  const takeSet = new Set<string>();
  const beatSet = new Set<string>();
  const projectBeatId = document.project.beatId;

  for (const clip of document.clips) {
    if (clip.sourceKind === "TAKE") {
      if (typeof clip.sourceTakeId !== "string" || !clip.sourceTakeId) {
        throw new RenderJobDomainError(
          "TAKE clip missing sourceTakeId.",
          "INVALID",
        );
      }
      takeSet.add(clip.sourceTakeId);
      continue;
    }
    if (clip.sourceKind === "BEAT_REF") {
      if (typeof clip.sourceBeatId !== "string" || !clip.sourceBeatId) {
        throw new RenderJobDomainError(
          "BEAT_REF clip missing sourceBeatId.",
          "INVALID",
        );
      }
      if (
        !beatRefMatchesProjectSsot({
          projectBeatId,
          sourceBeatId: clip.sourceBeatId,
        })
      ) {
        throw new RenderJobDomainError(
          "BEAT_REF does not match project beat SSOT.",
          "FORBIDDEN",
        );
      }
      beatSet.add(clip.sourceBeatId);
      continue;
    }
    // ARTIFACT — silent skip (not exportable in MVP).
  }

  if (takeSet.size > STUDIO_EXPORT_MAX_UNIQUE_TAKES) {
    throw new RenderJobDomainError(
      `Studio export exceeds max unique TAKE sources (${STUDIO_EXPORT_MAX_UNIQUE_TAKES}).`,
      "LIMIT",
    );
  }
  if (beatSet.size > STUDIO_EXPORT_MAX_UNIQUE_BEATS) {
    throw new RenderJobDomainError(
      `Studio export exceeds max unique BEAT_REF sources (${STUDIO_EXPORT_MAX_UNIQUE_BEATS}).`,
      "LIMIT",
    );
  }
  if (takeSet.size === 0 && beatSet.size === 0) {
    throw new RenderJobDomainError(
      "Studio export requires at least one TAKE or BEAT_REF source.",
      "INVALID",
    );
  }

  return {
    takeIds: [...takeSet].sort(),
    beatIds: [...beatSet].sort(),
  };
}

export function buildStudioExportDocumentSnapshot(params: {
  jobId: string;
  ownerId: string;
  projectId: string;
  documentVersion: number;
  capturedAt: string;
  document: StudioProjectDocument;
}): StudioExportDocumentSnapshotV1 {
  assertStudioDocumentWithinExportLimits(params.document);
  if (params.document.project.id !== params.projectId) {
    throw new RenderJobDomainError(
      "Snapshot projectId does not match document.",
      "INVALID",
    );
  }
  if (params.document.project.documentVersion !== params.documentVersion) {
    throw new RenderJobDomainError(
      "Snapshot documentVersion does not match document.",
      "INVALID",
    );
  }

  const documentDigest = digestStudioDocument(params.document);
  const snapshot: StudioExportDocumentSnapshotV1 = {
    schemaVersion: STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION,
    jobId: params.jobId,
    ownerId: params.ownerId,
    projectId: params.projectId,
    documentVersion: params.documentVersion,
    capturedAt: params.capturedAt,
    documentDigest,
    document: params.document,
  };

  assertNoForbiddenKeys(snapshot, "snapshot");
  const encoded = JSON.stringify(snapshot);
  if (Buffer.byteLength(encoded, "utf8") > STUDIO_EXPORT_MAX_SNAPSHOT_BYTES) {
    throw new RenderJobDomainError(
      `Studio export snapshot exceeds ${STUDIO_EXPORT_MAX_SNAPSHOT_BYTES} bytes.`,
      "LIMIT",
    );
  }
  return snapshot;
}

export function parseStudioExportDocumentSnapshot(
  raw: unknown,
  expected?: {
    jobId?: string;
    ownerId?: string;
    projectId?: string;
  },
): StudioExportDocumentSnapshotV1 {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RenderJobDomainError("Invalid document_snapshot.", "INVALID");
  }
  const row = raw as Record<string, unknown>;
  if (row.schemaVersion !== STUDIO_EXPORT_DOCUMENT_SNAPSHOT_SCHEMA_VERSION) {
    throw new RenderJobDomainError(
      "Unsupported document_snapshot schemaVersion.",
      "INVALID",
    );
  }
  for (const key of [
    "jobId",
    "ownerId",
    "projectId",
    "capturedAt",
    "documentDigest",
  ] as const) {
    if (typeof row[key] !== "string" || !(row[key] as string).trim()) {
      throw new RenderJobDomainError(
        `document_snapshot missing ${key}.`,
        "INVALID",
      );
    }
  }
  if (
    typeof row.documentVersion !== "number" ||
    !Number.isInteger(row.documentVersion) ||
    row.documentVersion < 1
  ) {
    throw new RenderJobDomainError(
      "document_snapshot.documentVersion invalid.",
      "INVALID",
    );
  }
  if (row.document === null || typeof row.document !== "object") {
    throw new RenderJobDomainError(
      "document_snapshot.document missing.",
      "INVALID",
    );
  }

  assertNoForbiddenKeys(row, "snapshot");

  const document = row.document as StudioProjectDocument;
  const digest = digestStudioDocument(document);
  if (digest !== row.documentDigest) {
    throw new RenderJobDomainError(
      "document_snapshot digest mismatch.",
      "INVALID",
    );
  }

  if (expected?.jobId && row.jobId !== expected.jobId) {
    throw new RenderJobDomainError(
      "document_snapshot jobId mismatch.",
      "FORBIDDEN",
    );
  }
  if (expected?.ownerId && row.ownerId !== expected.ownerId) {
    throw new RenderJobDomainError(
      "document_snapshot ownerId mismatch.",
      "FORBIDDEN",
    );
  }
  if (expected?.projectId && row.projectId !== expected.projectId) {
    throw new RenderJobDomainError(
      "document_snapshot projectId mismatch.",
      "FORBIDDEN",
    );
  }

  const snapshot = row as unknown as StudioExportDocumentSnapshotV1;
  assertStudioDocumentWithinExportLimits(snapshot.document);
  return snapshot;
}
