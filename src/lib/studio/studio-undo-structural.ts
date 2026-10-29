/**
 * Stage 0 — structural undo/redo (add / delete / split / duplicate) for Studio
 * clips and tracks. Pure orchestration over the existing CAS HTTP routes: no
 * new server writes, no storage touched. Each op runs as ONE persist executor
 * (serialised by the orchestrator); multi-step ops thread documentVersion
 * through every CAS call and report `partial` if a later step fails.
 *
 * Recreated rows get new ids — callers keep an alias map (old id → new id) so
 * older history entries keep pointing at the live row.
 *
 * Deliberately NOT supported: undo of "delete track" (restoring a track means
 * add + rename + controls + FX + role + every clip — many non-atomic CAS steps
 * and SAMPLE/Scratch tracks cannot be re-added through the add route).
 */
import type {
  StudioClipDto,
  StudioProjectDocument,
  StudioTrackDto,
} from "@/lib/studio/studio-types";

export type StudioStructuralUndoOp =
  /** Undo of add / duplicate / restore clip. */
  | { kind: "clip_remove"; clipId: string }
  /** Undo of delete clip; redo of add clip. Snapshot of the acked clip. */
  | { kind: "clip_restore"; clip: StudioClipDto }
  /** Redo of duplicate clip. */
  | { kind: "clip_duplicate"; sourceClipId: string; duplicateId: string }
  /** Undo of split: delete right half, restore left to the pre-split clip. */
  | { kind: "clip_unsplit"; leftId: string; rightId: string; original: StudioClipDto }
  /** Redo of split. */
  | { kind: "clip_split"; clipId: string; atTimelineMs: number; rightId: string }
  /** Undo of add / duplicate track (only if its clips are unchanged). */
  | { kind: "track_remove"; trackId: string; clipIds: string[] }
  /** Redo of add track. */
  | { kind: "track_add"; track: StudioTrackDto }
  /** Redo of duplicate track. */
  | {
      kind: "track_duplicate";
      sourceTrackId: string;
      duplicateTrackId: string;
      duplicateClipIds: string[];
    };

export const STUDIO_STRUCTURAL_UNDO_KINDS = new Set<StudioStructuralUndoOp["kind"]>([
  "clip_remove",
  "clip_restore",
  "clip_duplicate",
  "clip_unsplit",
  "clip_split",
  "track_remove",
  "track_add",
  "track_duplicate",
]);

export function isStudioStructuralUndoOp(op: { kind: string }): op is StudioStructuralUndoOp {
  return STUDIO_STRUCTURAL_UNDO_KINDS.has(op.kind as StudioStructuralUndoOp["kind"]);
}

export type StudioApiResponse = { ok: boolean; status: number; json: Record<string, unknown> };
export type StudioApiCall = (
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: Record<string, unknown>,
) => Promise<StudioApiResponse>;

export type StudioStructuralRunResult =
  | {
      ok: true;
      documentVersion: number;
      mutate: (doc: StudioProjectDocument) => StudioProjectDocument;
      /** A later CAS step failed after an earlier one landed. */
      partial: boolean;
      /** old id → new id for rows that were recreated. */
      aliases: Array<[string, string]>;
    }
  | { ok: false; status: number; message: string; code?: string };

/** Follow an alias chain (a → b → c) to the live id. */
export function resolveStudioUndoId(aliases: ReadonlyMap<string, string>, id: string): string {
  let cur = id;
  for (let i = 0; i < 64; i += 1) {
    const next = aliases.get(cur);
    if (!next || next === cur) return cur;
    cur = next;
  }
  return cur;
}

const SCRATCH_DEFAULTS = { cueMs: 0, reverse: false, rate: 1 };

function sortClips(clips: StudioClipDto[]): StudioClipDto[] {
  return [...clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
}

function sortTracks(tracks: StudioTrackDto[]): StudioTrackDto[] {
  return [...tracks].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Sync precheck against the committed document (ids already resolved).
 * Returns false when the op cannot run safely (row gone, track changed, …).
 */
export function canRunStudioStructuralOp(
  op: StudioStructuralUndoOp,
  doc: StudioProjectDocument,
): boolean {
  const hasClip = (id: string) => doc.clips.some((c) => c.id === id);
  const hasTrack = (id: string) => doc.tracks.some((t) => t.id === id);
  switch (op.kind) {
    case "clip_remove":
      return hasClip(op.clipId);
    case "clip_restore":
      return hasTrack(op.clip.trackId) && !hasClip(op.clip.id);
    case "clip_duplicate":
      return hasClip(op.sourceClipId);
    case "clip_unsplit":
      return hasClip(op.leftId) && hasClip(op.rightId);
    case "clip_split":
      return hasClip(op.clipId);
    case "track_remove": {
      const track = doc.tracks.find((t) => t.id === op.trackId);
      if (!track || track.trackType === "BEAT") return false;
      const current = doc.clips
        .filter((c) => c.trackId === op.trackId)
        .map((c) => c.id)
        .sort();
      const expected = [...op.clipIds].sort();
      // Never delete clips the history did not create (e.g. a later recording).
      return JSON.stringify(current) === JSON.stringify(expected);
    }
    case "track_add":
      return !hasTrack(op.track.id);
    case "track_duplicate":
      return hasTrack(op.sourceTrackId) && !hasTrack(op.duplicateTrackId);
  }
}

/** Rewrite every id in an op through the alias map. */
export function resolveStudioStructuralOpIds(
  op: StudioStructuralUndoOp,
  r: (id: string) => string,
): StudioStructuralUndoOp {
  switch (op.kind) {
    case "clip_remove":
      return { ...op, clipId: r(op.clipId) };
    case "clip_restore":
      return { ...op, clip: { ...op.clip, id: r(op.clip.id), trackId: r(op.clip.trackId) } };
    case "clip_duplicate":
      return { ...op, sourceClipId: r(op.sourceClipId), duplicateId: r(op.duplicateId) };
    case "clip_unsplit":
      return {
        ...op,
        leftId: r(op.leftId),
        rightId: r(op.rightId),
        original: { ...op.original, id: r(op.original.id), trackId: r(op.original.trackId) },
      };
    case "clip_split":
      return { ...op, clipId: r(op.clipId), rightId: r(op.rightId) };
    case "track_remove":
      return { ...op, trackId: r(op.trackId), clipIds: op.clipIds.map(r) };
    case "track_add":
      return op;
    case "track_duplicate":
      return {
        ...op,
        sourceTrackId: r(op.sourceTrackId),
        duplicateTrackId: r(op.duplicateTrackId),
        duplicateClipIds: op.duplicateClipIds.map(r),
      };
  }
}

function fail(res: StudioApiResponse, fallback: string): StudioStructuralRunResult {
  return {
    ok: false,
    status: res.status,
    message: typeof res.json.error === "string" ? res.json.error : fallback,
    code: typeof res.json.code === "string" ? res.json.code : undefined,
  };
}

function versionOf(res: StudioApiResponse): number | null {
  return res.ok && typeof res.json.documentVersion === "number" ? res.json.documentVersion : null;
}

/** Run one structural op through the existing CAS routes. */
export async function runStudioStructuralOp(
  op: StudioStructuralUndoOp,
  ctx: { projectId: string; documentVersion: number; doc: StudioProjectDocument; api: StudioApiCall },
): Promise<StudioStructuralRunResult> {
  const base = `/api/studio/projects/${ctx.projectId}`;
  let version = ctx.documentVersion;
  const call = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body: Record<string, unknown>,
  ) => ctx.api(method, `${base}${path}`, { ...body, expectedDocumentVersion: version });

  switch (op.kind) {
    case "clip_remove": {
      const res = await call("DELETE", `/clips/${op.clipId}`, {});
      const v = versionOf(res);
      if (v === null) return fail(res, "Nie udało się usunąć klipu.");
      return {
        ok: true,
        documentVersion: v,
        partial: false,
        aliases: [],
        mutate: (d) => ({ ...d, clips: d.clips.filter((c) => c.id !== op.clipId) }),
      };
    }

    case "clip_restore": {
      const src = op.clip;
      const res = await call("POST", `/clips`, {
        trackId: src.trackId,
        sourceKind: src.sourceKind,
        sourceTakeId: src.sourceTakeId,
        sourceBeatId: src.sourceBeatId,
        sourceArtifactId: src.sourceArtifactId,
        timelineStartMs: src.timelineStartMs,
        durationMs: src.durationMs,
        sourceOffsetMs: src.sourceOffsetMs,
      });
      const v = versionOf(res);
      const created = res.json.clip as StudioClipDto | undefined;
      if (v === null || !created) return fail(res, "Nie udało się odtworzyć klipu.");
      version = v;
      let clip = created;
      let partial = false;
      const steps: Array<Record<string, unknown>> = [];
      if (clip.fadeInMs !== src.fadeInMs || clip.fadeOutMs !== src.fadeOutMs) {
        steps.push({ op: "set_fades", fadeInMs: src.fadeInMs, fadeOutMs: src.fadeOutMs });
      }
      if (clip.gainDb !== src.gainDb) steps.push({ op: "set_gain", gainDb: src.gainDb });
      if (clip.muted !== src.muted) steps.push({ op: "set_mute", muted: src.muted });
      if (src.scratchCueMs !== undefined) {
        const want = {
          cueMs: src.scratchCueMs ?? SCRATCH_DEFAULTS.cueMs,
          reverse: src.scratchReverse ?? SCRATCH_DEFAULTS.reverse,
          rate: src.scratchRate ?? SCRATCH_DEFAULTS.rate,
        };
        const have = {
          cueMs: clip.scratchCueMs ?? SCRATCH_DEFAULTS.cueMs,
          reverse: clip.scratchReverse ?? SCRATCH_DEFAULTS.reverse,
          rate: clip.scratchRate ?? SCRATCH_DEFAULTS.rate,
        };
        if (JSON.stringify(want) !== JSON.stringify(have)) steps.push({ op: "set_scratch", ...want });
      }
      for (const step of steps) {
        const r = await call("PATCH", `/clips/${clip.id}`, step);
        const sv = versionOf(r);
        const next = r.json.clip as StudioClipDto | undefined;
        if (sv === null || !next) {
          partial = true;
          break;
        }
        version = sv;
        clip = next;
      }
      const finalClip = clip;
      return {
        ok: true,
        documentVersion: version,
        partial,
        aliases: [[src.id, finalClip.id]],
        mutate: (d) => ({ ...d, clips: sortClips([...d.clips, finalClip]) }),
      };
    }

    case "clip_duplicate": {
      const res = await call("POST", `/clips/${op.sourceClipId}/duplicate`, {});
      const v = versionOf(res);
      const original = res.json.original as StudioClipDto | undefined;
      const duplicate = res.json.duplicate as StudioClipDto | undefined;
      if (v === null || !original || !duplicate) return fail(res, "Nie udało się powielić klipu.");
      return {
        ok: true,
        documentVersion: v,
        partial: false,
        aliases: [[op.duplicateId, duplicate.id]],
        mutate: (d) => ({
          ...d,
          clips: sortClips([...d.clips.map((c) => (c.id === original.id ? original : c)), duplicate]),
        }),
      };
    }

    case "clip_unsplit": {
      const del = await call("DELETE", `/clips/${op.rightId}`, {});
      const v = versionOf(del);
      if (v === null) return fail(del, "Nie udało się scalić klipu.");
      version = v;
      const o = op.original;
      let left: StudioClipDto | undefined;
      let partial = false;
      const geo = await call("PATCH", `/clips/${op.leftId}`, {
        op: "set_geometry",
        timelineStartMs: o.timelineStartMs,
        durationMs: o.durationMs,
        sourceOffsetMs: o.sourceOffsetMs,
      });
      const gv = versionOf(geo);
      if (gv === null || !geo.json.clip) {
        partial = true;
      } else {
        version = gv;
        left = geo.json.clip as StudioClipDto;
        if (left.fadeInMs !== o.fadeInMs || left.fadeOutMs !== o.fadeOutMs) {
          const fades = await call("PATCH", `/clips/${op.leftId}`, {
            op: "set_fades",
            fadeInMs: o.fadeInMs,
            fadeOutMs: o.fadeOutMs,
          });
          const fv = versionOf(fades);
          if (fv === null || !fades.json.clip) partial = true;
          else {
            version = fv;
            left = fades.json.clip as StudioClipDto;
          }
        }
      }
      const finalLeft = left;
      return {
        ok: true,
        documentVersion: version,
        partial,
        aliases: [],
        mutate: (d) => ({
          ...d,
          clips: sortClips(
            d.clips
              .filter((c) => c.id !== op.rightId)
              .map((c) => (finalLeft && c.id === finalLeft.id ? finalLeft : c)),
          ),
        }),
      };
    }

    case "clip_split": {
      const res = await call("POST", `/clips/${op.clipId}/split`, { atTimelineMs: op.atTimelineMs });
      const v = versionOf(res);
      const left = res.json.left as StudioClipDto | undefined;
      const right = res.json.right as StudioClipDto | undefined;
      if (v === null || !left || !right) return fail(res, "Nie udało się podzielić klipu.");
      return {
        ok: true,
        documentVersion: v,
        partial: false,
        aliases: [[op.rightId, right.id]],
        mutate: (d) => ({
          ...d,
          clips: sortClips([...d.clips.map((c) => (c.id === left.id ? left : c)), right]),
        }),
      };
    }

    case "track_remove": {
      const res = await call("DELETE", `/tracks/${op.trackId}`, {});
      const v = versionOf(res);
      if (v === null) return fail(res, "Nie udało się usunąć ścieżki.");
      return {
        ok: true,
        documentVersion: v,
        partial: false,
        aliases: [],
        mutate: (d) => ({
          ...d,
          tracks: d.tracks.filter((t) => t.id !== op.trackId),
          clips: d.clips.filter((c) => c.trackId !== op.trackId),
        }),
      };
    }

    case "track_add": {
      const want = op.track;
      const res = await call("POST", `/tracks`, { trackType: want.trackType });
      const v = versionOf(res);
      const created = res.json.track as StudioTrackDto | undefined;
      if (v === null || !created) return fail(res, "Nie udało się dodać ścieżki.");
      version = v;
      let track = created;
      let partial = false;
      const patch: Record<string, unknown> = {};
      if (track.name !== want.name) patch.name = want.name;
      if (track.trackRole !== want.trackRole) patch.trackRole = want.trackRole;
      if (Object.keys(patch).length > 0) {
        const r = await call("PATCH", `/tracks/${track.id}`, patch);
        const pv = versionOf(r);
        if (pv === null || !r.json.track) partial = true;
        else {
          version = pv;
          track = r.json.track as StudioTrackDto;
        }
      }
      const finalTrack = track;
      return {
        ok: true,
        documentVersion: version,
        partial,
        aliases: [[want.id, finalTrack.id]],
        mutate: (d) => ({ ...d, tracks: sortTracks([...d.tracks, finalTrack]) }),
      };
    }

    case "track_duplicate": {
      const res = await call("POST", `/tracks/${op.sourceTrackId}/duplicate`, {});
      const v = versionOf(res);
      const track = res.json.track as StudioTrackDto | undefined;
      const clips = res.json.clips as StudioClipDto[] | undefined;
      if (v === null || !track || !Array.isArray(clips)) {
        return fail(res, "Nie udało się zduplikować ścieżki.");
      }
      const aliases: Array<[string, string]> = [[op.duplicateTrackId, track.id]];
      const newSorted = sortClips(clips);
      // Duplicate copies clips in timeline order, so old/new pair by index.
      op.duplicateClipIds.forEach((oldId, i) => {
        const next = newSorted[i];
        if (next) aliases.push([oldId, next.id]);
      });
      return {
        ok: true,
        documentVersion: v,
        partial: false,
        aliases,
        mutate: (d) => ({
          ...d,
          tracks: sortTracks([...d.tracks, track]),
          clips: sortClips([...d.clips, ...clips]),
        }),
      };
    }
  }
}
