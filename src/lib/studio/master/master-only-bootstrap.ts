/**
 * Master-Only 1 WAV — client bootstrap without Studio editor.
 * create project → Silver+ stem upload → place TAKE on VOCAL @ 0.
 */

import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";
import { uploadStemBlob } from "@/lib/takes/client-upload";
import {
  gateStudioVocalImportFile,
  STUDIO_VOCAL_IMPORT_ACCEPT,
} from "@/lib/takes/studio-vocal-import";

export { STUDIO_VOCAL_IMPORT_ACCEPT };

export type MasterOnlyBootstrapOk = {
  ok: true;
  projectId: string;
  trackId: string;
  takeId: string;
  documentVersion: number;
  document: StudioProjectDocument;
};

export type MasterOnlyBootstrapErr = {
  ok: false;
  code:
    | "gate"
    | "create"
    | "no_vocal_track"
    | "upload"
    | "place"
    | "network";
  message: string;
};

export type MasterOnlyBootstrapResult = MasterOnlyBootstrapOk | MasterOnlyBootstrapErr;

export function pickVocalTrackId(tracks: readonly StudioTrackDto[]): string | null {
  const vocal =
    tracks.find((t) => t.trackType === "VOCAL") ??
    tracks.find((t) => t.trackRole === "lead_vocal");
  return vocal?.id ?? null;
}

type FetchLike = typeof fetch;

export async function bootstrapMasterOnlyProject(input: {
  file: File;
  title?: string;
  fetchImpl?: FetchLike;
  uploadStem?: typeof uploadStemBlob;
  onStage?: (stage: string) => void;
}): Promise<MasterOnlyBootstrapResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const uploadStem = input.uploadStem ?? uploadStemBlob;
  const gate = gateStudioVocalImportFile(input.file);
  if (!gate.ok) return { ok: false, code: "gate", message: gate.message };

  input.onStage?.("create");
  let document: StudioProjectDocument;
  try {
    const createRes = await fetchImpl("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title?.trim() || input.file.name.replace(/\.[^.]+$/, "") || "Master only",
        beatId: null,
      }),
    });
    const createJson = (await createRes.json().catch(() => ({}))) as {
      success?: boolean;
      document?: StudioProjectDocument;
      error?: string;
      message?: string;
    };
    if (!createRes.ok || !createJson.document) {
      return {
        ok: false,
        code: "create",
        message: createJson.message ?? createJson.error ?? "Nie udało się utworzyć projektu.",
      };
    }
    document = createJson.document;
  } catch {
    return { ok: false, code: "network", message: "Błąd sieci przy tworzeniu projektu." };
  }

  const trackId = pickVocalTrackId(document.tracks);
  if (!trackId) {
    return { ok: false, code: "no_vocal_track", message: "Brak ścieżki wokalu w projekcie." };
  }

  input.onStage?.("upload");
  let takeId: string;
  try {
    const uploaded = await uploadStem({
      projectId: document.project.id,
      blob: input.file,
      contentType: gate.contentType,
    });
    takeId = uploaded.takeId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload nieudany.";
    return { ok: false, code: "upload", message };
  }

  input.onStage?.("place");
  try {
    const placeRes = await fetchImpl(
      `/api/studio/projects/${encodeURIComponent(document.project.id)}/record/place`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          takeId,
          timelineStartMs: 0,
          expectedDocumentVersion: document.project.documentVersion,
          replaceOverlapping: true,
        }),
      },
    );
    const placeJson = (await placeRes.json().catch(() => ({}))) as {
      success?: boolean;
      document?: StudioProjectDocument;
      error?: string;
      message?: string;
    };
    if (!placeRes.ok || !placeJson.document) {
      return {
        ok: false,
        code: "place",
        message: placeJson.message ?? placeJson.error ?? "Nie udało się wstawić pliku na oś.",
      };
    }
    document = placeJson.document;
  } catch {
    return { ok: false, code: "network", message: "Błąd sieci przy wstawianiu pliku." };
  }

  return {
    ok: true,
    projectId: document.project.id,
    trackId,
    takeId,
    documentVersion: document.project.documentVersion,
    document,
  };
}
