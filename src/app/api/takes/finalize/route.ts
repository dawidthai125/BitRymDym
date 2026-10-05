import { NextResponse } from "next/server";

import { finalizeTakeRecording } from "@/lib/takes/take-transport";
import { takeApiErrorResponse } from "@/lib/takes/api-error";

export const runtime = "nodejs";

/**
 * Recording Wave 2 / P2 — finalize take after signed binary upload.
 * POST JSON { takeId }
 * Duration probe is fail-closed (OD-W2-04). Atomic replace swap in DB RPC.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      takeId?: string;
      durationSeconds?: number;
      objectKey?: string | null;
      ownerId?: string | null;
    };

    if (typeof body.takeId !== "string" || !body.takeId) {
      return NextResponse.json(
        { error: "takeId is required." },
        { status: 400 },
      );
    }

    void body.durationSeconds;
    void body.objectKey;
    void body.ownerId;

    const result = await finalizeTakeRecording({ takeId: body.takeId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return takeApiErrorResponse(error);
  }
}
