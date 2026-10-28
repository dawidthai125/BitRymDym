import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { executeCatalogAssetCopyFor } from "@/lib/catalog/catalog-copy-service";
import {
  catalogCopyErrorHttpStatus,
  catalogCopyUserMessage,
} from "@/lib/catalog/catalog-originals";

export const runtime = "nodejs";

/**
 * Catalog original → private TAKE copy.
 * Authenticated. Client beatId / declared MIME are ignored.
 * Fail-closed: missing policies, unpublished/unlicensed, sniff fail → no write.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    let body: {
      catalogAssetId?: unknown;
      projectId?: unknown;
      beatId?: unknown;
      contentType?: unknown;
      byteSize?: unknown;
      durationSeconds?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    void body.beatId;
    void body.contentType;
    void body.byteSize;
    void body.durationSeconds;

    if (typeof body.catalogAssetId !== "string" || typeof body.projectId !== "string") {
      return NextResponse.json(
        { error: "catalogAssetId and projectId are required." },
        { status: 400 },
      );
    }

    const result = await executeCatalogAssetCopyFor(auth, {
      catalogAssetId: body.catalogAssetId,
      projectId: body.projectId,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          message: catalogCopyUserMessage(result.error),
          details: result.details,
        },
        { status: catalogCopyErrorHttpStatus(result.error) },
      );
    }
    return NextResponse.json({
      takeId: result.takeId,
      beatId: result.beatId,
      objectKey: result.objectKey,
      catalogAssetId: result.catalogAssetId,
      status: result.status,
      reusedExisting: result.reusedExisting,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
