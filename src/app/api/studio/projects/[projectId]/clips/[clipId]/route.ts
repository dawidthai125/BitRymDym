import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  deleteStudioClip,
  updateStudioClipFades,
  updateStudioClipGeometry,
  type StudioClipGeometryPatch,
} from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; clipId: string }>;
};

/**
 * PATCH — MOVE / TRIM Clip geometry, or set_fades (P6.7.2 CAS).
 * Source Take / Beat / Artifact references are immutable.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId, clipId } = await context.params;
    const body = (await request.json()) as {
      op?: StudioClipGeometryPatch["op"] | "set_fades";
      timelineStartMs?: number;
      durationMs?: number;
      sourceOffsetMs?: number;
      trimMs?: number;
      playheadMs?: number;
      fadeInMs?: unknown;
      fadeOutMs?: unknown;
      expectedDocumentVersion?: unknown;
    };

    if (body.op === "set_fades") {
      const result = await updateStudioClipFades({
        projectId,
        clipId,
        expectedDocumentVersion: body.expectedDocumentVersion,
        fadeInMs: body.fadeInMs,
        fadeOutMs: body.fadeOutMs,
      });
      return NextResponse.json({
        success: true,
        clip: result.clip,
        documentVersion: result.documentVersion,
      });
    }

    let patch: StudioClipGeometryPatch;
    switch (body.op) {
      case "move":
        if (typeof body.timelineStartMs !== "number") {
          return NextResponse.json(
            { error: "timelineStartMs jest wymagane dla przesunięcia." },
            { status: 400 },
          );
        }
        patch = { op: "move", timelineStartMs: body.timelineStartMs };
        break;
      case "trim_left":
        if (typeof body.trimMs !== "number") {
          return NextResponse.json(
            { error: "trimMs jest wymagane." },
            { status: 400 },
          );
        }
        patch = { op: "trim_left", trimMs: body.trimMs };
        break;
      case "trim_right":
        if (typeof body.trimMs !== "number") {
          return NextResponse.json(
            { error: "trimMs jest wymagane." },
            { status: 400 },
          );
        }
        patch = { op: "trim_right", trimMs: body.trimMs };
        break;
      case "trim_left_to_playhead":
        if (typeof body.playheadMs !== "number") {
          return NextResponse.json(
            { error: "playheadMs jest wymagane." },
            { status: 400 },
          );
        }
        patch = {
          op: "trim_left_to_playhead",
          playheadMs: body.playheadMs,
        };
        break;
      case "trim_right_to_playhead":
        if (typeof body.playheadMs !== "number") {
          return NextResponse.json(
            { error: "playheadMs jest wymagane." },
            { status: 400 },
          );
        }
        patch = {
          op: "trim_right_to_playhead",
          playheadMs: body.playheadMs,
        };
        break;
      case "set_geometry":
        if (
          typeof body.timelineStartMs !== "number" ||
          typeof body.durationMs !== "number" ||
          typeof body.sourceOffsetMs !== "number"
        ) {
          return NextResponse.json(
            {
              error:
                "timelineStartMs, durationMs i sourceOffsetMs są wymagane.",
            },
            { status: 400 },
          );
        }
        patch = {
          op: "set_geometry",
          timelineStartMs: body.timelineStartMs,
          durationMs: body.durationMs,
          sourceOffsetMs: body.sourceOffsetMs,
        };
        break;
      default:
        return NextResponse.json(
          { error: "Nieznana lub brakująca operacja (op)." },
          { status: 400 },
        );
    }

    const clip = await updateStudioClipGeometry({
      projectId,
      clipId,
      patch,
    });
    return NextResponse.json({ success: true, clip });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/**
 * DELETE — remove Clip only. Source Take / Beat / storage remain intact.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { projectId, clipId } = await context.params;
    const result = await deleteStudioClip({ projectId, clipId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
