import { TAKE_AUDIO_BUCKET } from "@/config/recording";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a uuid`);
  }
}

/**
 * Server-chosen USER take object key.
 * Client must never supply ownerId / takeId path segments.
 */
export function buildUserTakeObjectKey(params: {
  ownerId: string;
  takeId: string;
}): string {
  assertUuid(params.ownerId, "ownerId");
  assertUuid(params.takeId, "takeId");
  return `user/${params.ownerId}/takes/${params.takeId}/mic.bin`;
}

/**
 * Server-chosen anonymous take object key.
 * tokenHashPrefix = first 32 hex chars of server-side hash (never raw token).
 */
export function buildAnonTakeObjectKey(params: {
  tokenHashPrefix: string;
  takeId: string;
}): string {
  assertUuid(params.takeId, "takeId");
  if (!/^[a-f0-9]{16,64}$/i.test(params.tokenHashPrefix)) {
    throw new Error("tokenHashPrefix must be hex");
  }
  return `anon/${params.tokenHashPrefix}/takes/${params.takeId}/mic.bin`;
}

export function expectedUserTakeObjectKey(params: {
  ownerId: string;
  takeId: string;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildUserTakeObjectKey(params);
  } catch {
    return false;
  }
}

export function expectedAnonTakeObjectKey(params: {
  tokenHashPrefix: string;
  takeId: string;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildAnonTakeObjectKey(params);
  } catch {
    return false;
  }
}

export function isTakeAudioBucket(bucket: string): boolean {
  return bucket === TAKE_AUDIO_BUCKET;
}
