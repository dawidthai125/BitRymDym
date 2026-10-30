import { NextResponse } from "next/server";

import { BEAT_COVER_MAX_INPUT_BYTES } from "@/config/beat-covers";
import { requireUser } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";
import { uploadYoutubeImage } from "@/lib/studio/video/server";

import { DENY_STATUS, masterErrorResponse, tierOf } from "../../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST multipart `image` — Gold own graphic for the YouTube video: same checks + content
 * filter as beat covers (aspect kept). → {imageId, previewUrl}. Below Gold → 403 tier_video.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    let file: File | null = null;
    try {
      const v = (await request.formData()).get("image");
      file = v instanceof File ? v : null;
    } catch {
      file = null;
    }
    if (!file) return NextResponse.json({ success: false, error: "bad_request" }, { status: 400 });
    if (file.size > BEAT_COVER_MAX_INPUT_BYTES) return NextResponse.json({ success: false, error: "too_big", message: "Grafika może mieć maksymalnie 4 MB." }, { status: 413 });
    const r = await uploadYoutubeImage({ ownerId: auth.userId, projectId, tier, bytes: new Uint8Array(await file.arrayBuffer()) });
    if (!r.ok) return NextResponse.json({ success: false, ...r, ...(r.error === "tier_video" ? { upsell: "/premium" } : {}) }, { status: DENY_STATUS[r.error] ?? 400 });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    if (error instanceof BeatRequestError) return NextResponse.json({ success: false, error: "image_rejected", message: error.message }, { status: 422 });
    return masterErrorResponse(error);
  }
}
