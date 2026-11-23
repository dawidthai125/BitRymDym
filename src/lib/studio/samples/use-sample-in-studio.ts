/**
 * "Użyj w Studiu" on /sampel/[id]: put a catalogue sample into one of the user's projects.
 * Client-safe. Reuses the Studio endpoints (project document, tracks, sample copy, place);
 * plan limits, ownership and CAS stay on the server.
 */
import { placeOwnedStudioSample } from "@/lib/studio/studio-scratch-place";
import type { StudioClipDto, StudioProjectDocument, StudioProjectSummary, StudioTrackDto } from "@/lib/studio/studio-types";

type FetchLike = typeof fetch;

export type UseSampleResult =
  /** Where the sample landed (the timeline may be long). */
  | { ok: true; startMs: number; trackName: string }
  /** The plan has no free track: the user may choose an existing one. */
  | { ok: false; kind: "capacity"; message: string; tracks: { id: string; name: string }[] }
  | { ok: false; kind: "auth" | "error"; message: string | null };

/** Samples need a project with a beat (the copy is bound to it). */
export function projectsForSample(projects: readonly StudioProjectSummary[]): StudioProjectSummary[] {
  return projects.filter((p) => Boolean(p.beatId));
}

/** First free moment on a track: after its last clip (never over a recording). */
export function nextFreeStartMs(clips: readonly Pick<StudioClipDto, "trackId" | "timelineStartMs" | "durationMs">[], trackId: string): number {
  return clips
    .filter((c) => c.trackId === trackId)
    .reduce((end, c) => Math.max(end, Math.ceil(c.timelineStartMs + c.durationMs)), 0);
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function loadSampleProjects(fetchImpl: FetchLike = fetch): Promise<StudioProjectSummary[] | "auth" | "error"> {
  const res = await fetchImpl("/api/studio/projects");
  if (res.status === 401) return "auth";
  const body = await readJson<{ projects?: StudioProjectSummary[] }>(res);
  return res.ok && Array.isArray(body?.projects) ? projectsForSample(body.projects) : "error";
}

export async function addSampleToProject(
  input: { projectId: string; sampleId: string; /** Chosen by the user after "capacity". */ trackId?: string },
  fetchImpl: FetchLike = fetch,
): Promise<UseSampleResult> {
  const base = `/api/studio/projects/${input.projectId}`;
  const docRes = await fetchImpl(base);
  if (docRes.status === 401) return { ok: false, kind: "auth", message: null };
  const doc = (await readJson<{ document?: StudioProjectDocument }>(docRes))?.document;
  if (!docRes.ok || !doc) return { ok: false, kind: "error", message: null };
  let version = doc.project.documentVersion;

  const own = doc.tracks.filter((t) => t.trackType !== "BEAT");
  let trackId = input.trackId ? own.find((t) => t.id === input.trackId)?.id : own.find((t) => t.trackType === "SAMPLE")?.id;
  let trackName = own.find((t) => t.id === trackId)?.name ?? "Sample";
  if (!trackId) {
    const add = await fetchImpl(`${base}/tracks`, json("POST", { expectedDocumentVersion: version, trackType: "SAMPLE" }));
    const added = await readJson<{ track?: StudioTrackDto; documentVersion?: number; error?: string; message?: string; code?: string }>(add);
    if (!add.ok || !added?.track) {
      const message = added?.message || added?.error || null;
      return add.status === 403 && own.length > 0
        ? { ok: false, kind: "capacity", message: message ?? "", tracks: own.map((t) => ({ id: t.id, name: t.name })) }
        : { ok: false, kind: add.status === 401 ? "auth" : "error", message };
    }
    trackId = added.track.id;
    trackName = added.track.name || trackName;
    version = added.documentVersion ?? version + 1;
    // Same role the Studio gives its sample tracks; the sample still lands when this fails.
    const role = await fetchImpl(`${base}/tracks/${trackId}`, json("PATCH", { expectedDocumentVersion: version, trackRole: "instrument" }));
    const patched = await readJson<{ documentVersion?: number }>(role);
    if (role.ok && typeof patched?.documentVersion === "number") version = patched.documentVersion;
  }

  const startMs = nextFreeStartMs(doc.clips, trackId);
  const placed = await placeOwnedStudioSample(
    {
      projectId: input.projectId,
      sampleId: input.sampleId,
      trackId,
      timelineStartMs: startMs,
      expectedDocumentVersion: version,
    },
    fetchImpl,
  );
  return placed.ok
    ? { ok: true, startMs, trackName }
    : { ok: false, kind: placed.status === 401 ? "auth" : "error", message: placed.error };
}
