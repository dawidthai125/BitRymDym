import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import {
  completeMasterReplaceUpload,
  createMasterReplaceSignedUploadSession,
} from "@/lib/beats/audio-transport";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST JSON:
 * - { action: "session", contentType, byteSize, originalFilename? }
 * - { action: "complete", assetId }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: beatId } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      contentType?: string;
      byteSize?: number;
      originalFilename?: string | null;
      assetId?: string;
    };

    if (body.action === "session") {
      if (
        typeof body.contentType !== "string" ||
        typeof body.byteSize !== "number" ||
        !Number.isInteger(body.byteSize)
      ) {
        return NextResponse.json(
          { error: "contentType and integer byteSize are required." },
          { status: 400 },
        );
      }
      const session = await createMasterReplaceSignedUploadSession({
        beatId,
        contentType: body.contentType,
        byteSize: body.byteSize,
        originalFilename: body.originalFilename ?? null,
      });
      return NextResponse.json({ success: true, ...session });
    }

    if (body.action === "complete") {
      if (typeof body.assetId !== "string") {
        return NextResponse.json(
          { error: "assetId is required." },
          { status: 400 },
        );
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

    return NextResponse.json(
      { error: "action must be session or complete." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 401 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Master upload failed.",
      },
      { status: 400 },
    );
  }
}
