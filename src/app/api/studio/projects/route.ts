import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  createStudioProject,
  listStudioProjects,
} from "@/lib/studio/studio-service";

export const runtime = "nodejs";

/** GET — list own Studio projects. POST — create project. */
export async function GET() {
  try {
    const projects = await listStudioProjects();
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      beatId?: string | null;
    };
    const document = await createStudioProject({
      title: body.title,
      beatId: body.beatId ?? null,
    });
    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
