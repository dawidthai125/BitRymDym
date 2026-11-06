import "server-only";

import sharp from "sharp";

import { BeatRequestError } from "@/lib/beats/request-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  dhashHex,
  grayStddev,
  isCoverDhash,
  nearestForeignCover,
  type CoverHashRow,
} from "./cover-fingerprint";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const COVER_DUPLICATE_MESSAGE =
  "Ta okładka jest bardzo podobna do okładki innego bitu. Wybierz własną grafikę.";

export async function describeCoverImage(bytes: Buffer): Promise<{ dhash: string; stddev: number }> {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gray = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return { dhash: dhashHex(gray, info.width, info.height), stddev: grayStddev(gray) };
}

function rowDhash(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const dhash = (value as { dhash?: unknown }).dhash;
  return isCoverDhash(dhash) ? dhash : null;
}

/** Reject a detailed image that matches another user's pending or approved cover. */
export async function assertCoverIsDistinct(
  admin: Admin,
  params: { ownerId: string; excludeBeatId?: string | null; bytes: Buffer },
): Promise<{ dhash: string; stddev: number }> {
  const fp = await describeCoverImage(params.bytes);
  const { data, error } = await admin
    .from("beats")
    .select("id, owner_id, cover_moderation")
    .in("cover_status", ["pending", "approved"])
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows: CoverHashRow[] = ((data ?? []) as { id: string; owner_id: string | null; cover_moderation: unknown }[]).map(
    (row) => ({ id: row.id, ownerId: row.owner_id, dhash: rowDhash(row.cover_moderation) }),
  );
  if (nearestForeignCover(rows, { ...fp, ownerId: params.ownerId, excludeBeatId: params.excludeBeatId })) {
    throw new BeatRequestError(COVER_DUPLICATE_MESSAGE);
  }
  return fp;
}
