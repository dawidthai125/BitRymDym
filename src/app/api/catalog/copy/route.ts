import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { prepareCatalogAssetCopy } from "@/lib/catalog/catalog-originals";

export const runtime = "nodejs";

/**
 * Implementation Catalog skeleton — platform catalog → private TAKE copy.
 * Authenticated. No Storage/DB write. Copy remains COPY_NOT_IMPLEMENTED.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as {
      catalogAssetId?: unknown;
      projectId?: unknown;
      contentType?: unknown;
      byteSize?: unknown;
      durationSeconds?: unknown;
      beatId?: unknown;
    };
    void body.beatId;

    if (typeof body.catalogAssetId !== "string" || typeof body.projectId !== "string") {
      return NextResponse.json(
        { error: "catalogAssetId and projectId are required." },
        { status: 400 },
      );
    }
    if (
      typeof body.contentType !== "string" ||
      typeof body.byteSize !== "number" ||
      typeof body.durationSeconds !== "number"
    ) {
      return NextResponse.json(
        { error: "contentType, byteSize, and durationSeconds are required." },
        { status: 400 },
      );
    }

    const result = prepareCatalogAssetCopy({
      catalogAssetId: body.catalogAssetId,
      projectId: body.projectId,
      contentType: body.contentType,
      byteSize: body.byteSize,
      durationSeconds: body.durationSeconds,
    });
    if (result.error === "VALIDATION_FAILED") {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: 501 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
