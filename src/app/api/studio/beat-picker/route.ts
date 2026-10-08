import { NextResponse } from "next/server";

import { listPublishedBeats, listOwnUserBeats } from "@/lib/beats/service";
import { listMyDownloadHistory } from "@/lib/downloads/history";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

export type StudioBeatPickerItem = {
  id: string;
  title: string;
  producer: string | null;
  bpm: number | null;
};

/**
 * AUD-01 — beat picker lists (catalog / mine / downloads).
 * Query: ?tab=catalog|mine|downloads
 */
export async function GET(request: Request) {
  try {
    const tab = new URL(request.url).searchParams.get("tab") ?? "catalog";
    if (tab !== "catalog" && tab !== "mine" && tab !== "downloads") {
      return NextResponse.json(
        { error: "Invalid tab. Use catalog|mine|downloads." },
        { status: 400 },
      );
    }

    let beats: StudioBeatPickerItem[] = [];

    if (tab === "catalog") {
      const rows = await listPublishedBeats();
      beats = rows.map((b) => ({
        id: b.id,
        title: b.title,
        producer: b.producer,
        bpm: typeof b.bpm === "number" ? b.bpm : null,
      }));
    } else if (tab === "mine") {
      const rows = await listOwnUserBeats();
      beats = rows.map((b) => ({
        id: b.id,
        title: b.title,
        producer: b.producer,
        bpm: typeof b.bpm === "number" ? b.bpm : null,
      }));
    } else {
      const rows = await listMyDownloadHistory();
      beats = rows.map((b) => ({
        id: b.beatId,
        title: b.title,
        producer: b.producer,
        bpm: null,
      }));
    }

    return NextResponse.json({ success: true, tab, beats });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}
