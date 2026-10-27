import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import {
  catalogCopyErrorHttpStatus,
  prepareCatalogAssetCopy,
} from "@/lib/catalog/catalog-originals";

export const runtime = "nodejs";

/**
 * Catalog → private TAKE copy planner.
 * Authenticated. Fail-closed when policies/prod are unknown.
 * Content sniff requires server-held original bytes (not client MIME).
 * No Storage/DB write. Client beatId is ignored.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
    let body: {
      catalogAssetId?: unknown;
      projectId?: unknown;
      contentType?: unknown;
      byteSize?: unknown;
      durationSeconds?: unknown;
      beatId?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
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
    void result.write;
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: catalogCopyErrorHttpStatus(result.error) },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
