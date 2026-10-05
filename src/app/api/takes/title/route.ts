import { NextResponse } from "next/server";

import { updateOwnTakeTitle } from "@/lib/takes/take-title-service";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * P4.2 — PATCH own take title.
 * Body: { takeId, title: string | null }
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      title?: unknown;
    };
    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json({ error: "takeId is required." }, { status: 400 });
    }
    if (!("title" in body)) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    const result = await updateOwnTakeTitle({
      takeId: body.takeId,
      title: body.title,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
