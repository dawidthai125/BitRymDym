/**
 * Master-Only 1 file — client bootstrap without Studio editor.
 * create project (no beat) → Silver+ stem upload → place TAKE on VOCAL @ 0.
 * Any failure after the project exists deletes it again: a failed try must not use up the project limit.
 */

import { STEM_AUDIO_MAX_BYTES, STEM_MAX_SECONDS } from "@/config/recording";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";
import { uploadStemBlob } from "@/lib/takes/client-upload";
import {
  probeStudioVocalImportDurationSeconds,
  resolveStudioVocalImportContentType,
  STUDIO_VOCAL_IMPORT_ACCEPT,
} from "@/lib/takes/studio-vocal-import";

export { STUDIO_VOCAL_IMPORT_ACCEPT };

export const MASTER_ONLY_MAX_MB = Math.floor(STEM_AUDIO_MAX_BYTES / (1024 * 1024));
export const MASTER_ONLY_MAX_SECONDS = STEM_MAX_SECONDS;

export type MasterOnlyBootstrapOk = {
  ok: true;
  projectId: string;
  trackId: string;
  takeId: string;
  documentVersion: number;
};

export type MasterOnlyBootstrapCode =
  | "format"
  | "too_big"
  | "too_long"
  | "create"
  | "no_vocal_track"
  | "upload"
  | "place"
  | "network";

export type MasterOnlyBootstrapErr = {
  ok: false;
  code: MasterOnlyBootstrapCode;
  /** Polish sentence from the server (plan limit, project limit…), when it sent one. */
  message: string | null;
};

export type MasterOnlyBootstrapResult = MasterOnlyBootstrapOk | MasterOnlyBootstrapErr;

export function pickVocalTrackId(tracks: readonly StudioTrackDto[]): string | null {
  const vocal =
    tracks.find((t) => t.trackType === "VOCAL") ??
    tracks.find((t) => t.trackRole === "lead_vocal");
  return vocal?.id ?? null;
}

type FetchLike = typeof fetch;

/** Server text worth showing: our own Polish sentence, never an internal code or English detail. */
function serverText(json: { error?: unknown; message?: unknown }): string | null {
  for (const v of [json.message, json.error]) {
    if (typeof v === "string" && /[ąćęłńóśźż]/i.test(v)) return v;
  }
  return null;
}

/** Best effort, also while the page is closing. */
export async function discardMasterOnlyProject(projectId: string, fetchImpl: FetchLike = fetch): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetchImpl(`/api/studio/projects/${encodeURIComponent(projectId)}`, { method: "DELETE", keepalive: true });
      if (r.ok || r.status < 500) return;
    } catch {
      // one more try
    }
  }
}

export async function bootstrapMasterOnlyProject(input: {
  file: File;
  title?: string;
  fetchImpl?: FetchLike;
  uploadStem?: typeof uploadStemBlob;
  probeDuration?: (file: Blob) => Promise<number | null>;
  onStage?: (stage: string) => void;
}): Promise<MasterOnlyBootstrapResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const uploadStem = input.uploadStem ?? uploadStemBlob;
  // Everything that can be refused here is refused before a project exists.
  const contentType = resolveStudioVocalImportContentType(input.file);
  if (!contentType) return { ok: false, code: "format", message: null };
  if (input.file.size <= 0 || input.file.size > STEM_AUDIO_MAX_BYTES) return { ok: false, code: "too_big", message: null };
  const seconds = await (input.probeDuration ?? probeStudioVocalImportDurationSeconds)(input.file);
  if (seconds !== null && Math.ceil(seconds) > STEM_MAX_SECONDS + 1) return { ok: false, code: "too_long", message: null };

  input.onStage?.("create");
  let document: StudioProjectDocument;
  try {
    const createRes = await fetchImpl("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: (input.title?.trim() || input.file.name.replace(/\.[^.]+$/, "") || "Master").slice(0, 120),
        beatId: null,
      }),
    });
    const createJson = (await createRes.json().catch(() => ({}))) as {
      document?: StudioProjectDocument;
      error?: string;
      message?: string;
    };
    if (!createRes.ok || !createJson.document) return { ok: false, code: "create", message: serverText(createJson) };
    document = createJson.document;
  } catch {
    return { ok: false, code: "network", message: null };
  }

  const projectId = document.project.id;
  const fail = async (code: MasterOnlyBootstrapCode, message: string | null): Promise<MasterOnlyBootstrapErr> => {
    await discardMasterOnlyProject(projectId, fetchImpl);
    return { ok: false, code, message };
  };

  const trackId = pickVocalTrackId(document.tracks);
  if (!trackId) return fail("no_vocal_track", null);

  input.onStage?.("upload");
  let takeId: string;
  try {
    const uploaded = await uploadStem({ projectId, blob: input.file, contentType, masterOnly: true });
    takeId = uploaded.takeId;
  } catch (error) {
    if (error instanceof TypeError) return fail("network", null);
    return fail("upload", serverText({ error: error instanceof Error ? error.message : null }));
  }

  input.onStage?.("place");
  let placeRes: Response;
  try {
    placeRes = await fetchImpl(`/api/studio/projects/${encodeURIComponent(projectId)}/record/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId,
        takeId,
        timelineStartMs: 0,
        expectedDocumentVersion: document.project.documentVersion,
      }),
    });
  } catch {
    return fail("network", null);
  }
  // The route answers with the clip and the new version (not the whole document).
  const placeJson = (await placeRes.json().catch(() => ({}))) as { documentVersion?: number; error?: string };
  if (!placeRes.ok || typeof placeJson.documentVersion !== "number") return fail("place", serverText(placeJson));

  return { ok: true, projectId, trackId, takeId, documentVersion: placeJson.documentVersion };
}
