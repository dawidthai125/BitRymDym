import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { BEAT_COVER_MAX_INPUT_BYTES } from "@/config/beat-covers";
import { requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import {
  loadBeatCoverForViewer,
  removeOwnBeatCover,
  uploadOwnBeatCover,
} from "@/lib/beats/cover/cover-service";

export const runtime = "nodejs";

function revalidateCoverSurfaces(beatId: string) {
  revalidatePath("/beats");
  revalidatePath("/");
  revalidatePath("/account/beats");
  revalidatePath(`/account/beats/${beatId}/edit`);
  revalidatePath(`/beat/${beatId}`);
  revalidatePath("/admin/moderation");
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * User beats 2026-10-30 — cover image.
 * GET  /api/beats/[id]/cover?s=thumb|full  (visibility-checked; private bucket)
 * POST /api/beats/[id]/cover  multipart field "cover" (owner; filtered)
 * DELETE /api/beats/[id]/cover (owner)
 */
export async function GET(request: Request, context: RouteContext) {
  const { id: beatId } = await context.params;
  if (!isUuid(beatId)) return new NextResponse(null, { status: 404 });
  const size = new URL(request.url).searchParams.get("s") === "full" ? "full" : "thumb";
  try {
    const cover = await loadBeatCoverForViewer(beatId, size);
    if (!cover) return new NextResponse(null, { status: 404 });
    return new NextResponse(cover.bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": cover.publicCache
          ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
          : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[api/beats/[id]/cover GET]", error);
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { id: beatId } = await context.params;
    if (!isUuid(beatId)) return beatApiBadRequest("Beat id must be a uuid.");
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > BEAT_COVER_MAX_INPUT_BYTES + 64 * 1024) {
      return beatApiBadRequest("Okładka może mieć maksymalnie 4 MB.");
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("cover");
    if (!file || typeof file === "string") {
      return beatApiBadRequest("Wybierz plik okładki (JPG, PNG lub WebP).");
    }
    if (file.size > BEAT_COVER_MAX_INPUT_BYTES) {
      return beatApiBadRequest("Okładka może mieć maksymalnie 4 MB.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadOwnBeatCover(auth, beatId, bytes);
    revalidateCoverSurfaces(beatId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return beatApiErrorResponse(error, "api/beats/[id]/cover POST");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { id: beatId } = await context.params;
    if (!isUuid(beatId)) return beatApiBadRequest("Beat id must be a uuid.");
    await removeOwnBeatCover(auth, beatId);
    revalidateCoverSurfaces(beatId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return beatApiErrorResponse(error, "api/beats/[id]/cover DELETE");
  }
}
