import { NextResponse } from "next/server";

import {
  beatAudioApiErrorResponse,
  beatApiBadRequest,
} from "@/lib/beats/beat-operation-error";
import {
  completeMasterReplaceUpload,
  createMasterReplaceSignedUploadSession,
} from "@/lib/beats/audio-transport";
import { isUuid } from "@/lib/beats/audio-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST JSON:
 * - { action: "session", contentType, byteSize, originalFilename? }
 * - { action: "complete", assetId }
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: beatId } = await context.params;
  if (!isUuid(beatId)) {
    return beatApiBadRequest("Beat id must be a uuid.");
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    contentType?: unknown;
    byteSize?: unknown;
    originalFilename?: unknown;
    assetId?: unknown;
  } | null;
  if (!body) {
    return beatApiBadRequest("JSON body is required.");
  }

  try {
    if (body.action === "session") {
      if (
        typeof body.contentType !== "string" ||
        typeof body.byteSize !== "number" ||
        !Number.isInteger(body.byteSize)
      ) {
        return beatApiBadRequest(
          "contentType and integer byteSize are required.",
        );
      }
      const session = await createMasterReplaceSignedUploadSession({
        beatId,
        contentType: body.contentType,
        byteSize: body.byteSize,
        originalFilename:
          typeof body.originalFilename === "string"
            ? body.originalFilename
            : null,
      });
      return NextResponse.json({ success: true, ...session });
    }

    if (body.action === "complete") {
      if (!isUuid(body.assetId)) {
        return beatApiBadRequest("assetId (uuid) is required.");
      }
      const asset = await completeMasterReplaceUpload({
        beatId,
        assetId: body.assetId,
      });
      return NextResponse.json({
        success: true,
        assetId: asset.id,
        status: asset.status,
      });
    }

    return beatApiBadRequest("action must be session or complete.");
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/[id]/master");
  }
}
