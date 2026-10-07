/**
 * POST-RECORDING V1 — Clip Gain / Mute write path + CAS + AuthZ contract.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { clipGraphGain } from "@/lib/studio/studio-audio-schedule";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  applyStudioClipGainMuteCasToState,
  buildStudioClipGainPatchBody,
  buildStudioClipMutePatchBody,
  interpretStudioClipMixPersistResponse,
  parseStudioClipGainDb,
  parseStudioClipMuted,
  STUDIO_CLIP_GAIN_DB_MAX,
  STUDIO_CLIP_GAIN_DB_MIN,
} from "@/lib/studio/studio-clip-mix";
import {
  baseClipGain,
  effectiveClipGain,
} from "@/lib/studio/studio-clip-fade";
import {
  parseExpectedDocumentVersion,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261007150000_pr_v1_studio_cas_clip_gain_mute.sql",
);

describe("PR-01 Clip Gain — validation", () => {
  it("accepts gain within Track/Master bounds", () => {
    expect(parseStudioClipGainDb(0)).toBe(0);
    expect(parseStudioClipGainDb(-3)).toBe(-3);
    expect(parseStudioClipGainDb(STUDIO_CLIP_GAIN_DB_MIN)).toBe(
      STUDIO_CLIP_GAIN_DB_MIN,
    );
    expect(parseStudioClipGainDb(STUDIO_CLIP_GAIN_DB_MAX)).toBe(
      STUDIO_CLIP_GAIN_DB_MAX,
    );
  });

  it("rejects out-of-range / invalid gain → 400 vocabulary", () => {
    expect(() => parseStudioClipGainDb(-25)).toThrow(StudioFxChainError);
    expect(() => parseStudioClipGainDb(13)).toThrow(StudioFxChainError);
    expect(() => parseStudioClipGainDb("0")).toThrow(StudioFxChainError);
    expect(() => parseStudioClipGainDb(NaN)).toThrow(StudioFxChainError);
    expect(
      studioApiErrorResponse(
        new StudioFxChainError("FX_CHAIN_INVALID", "x"),
      ).status,
    ).toBe(400);
  });

  it("rejects missing/invalid expectedDocumentVersion → 400", () => {
    expect(() => parseExpectedDocumentVersion(undefined)).toThrow(
      StudioFxChainError,
    );
    expect(() => parseExpectedDocumentVersion(1.5)).toThrow(StudioFxChainError);
  });
});

describe("PR-02 Clip Mute — validation", () => {
  it("accepts boolean muted", () => {
    expect(parseStudioClipMuted(true)).toBe(true);
    expect(parseStudioClipMuted(false)).toBe(false);
  });

  it("rejects non-boolean muted → 400", () => {
    expect(() => parseStudioClipMuted(1)).toThrow(StudioFxChainError);
    expect(() => parseStudioClipMuted("true")).toThrow(StudioFxChainError);
    expect(() => parseStudioClipMuted(null)).toThrow(StudioFxChainError);
  });
});

describe("PR-01/02 CAS (in-memory)", () => {
  it("owner + correct version → gain saved, documentVersion +1", () => {
    const before = { documentVersion: 5, gainDb: 0, muted: false };
    const after = applyStudioClipGainMuteCasToState(before, 5, {
      gainDb: -3,
    });
    expect(after).toEqual({ documentVersion: 6, gainDb: -3, muted: false });
  });

  it("owner + correct version → mute saved, documentVersion +1", () => {
    const before = { documentVersion: 5, gainDb: -3, muted: false };
    const after = applyStudioClipGainMuteCasToState(before, 5, {
      muted: true,
    });
    expect(after).toEqual({ documentVersion: 6, gainDb: -3, muted: true });
  });

  it("stale version → conflict, state unchanged", () => {
    const state = { documentVersion: 8, gainDb: -6, muted: false };
    expect(() =>
      applyStudioClipGainMuteCasToState(state, 7, { gainDb: 0 }),
    ).toThrow(StudioFxCasConflictError);
    expect(state).toEqual({ documentVersion: 8, gainDb: -6, muted: false });
  });

  it("gain update does not clear muted; mute update does not clear gain", () => {
    const afterGain = applyStudioClipGainMuteCasToState(
      { documentVersion: 1, gainDb: 0, muted: true },
      1,
      { gainDb: 2 },
    );
    expect(afterGain.muted).toBe(true);
    expect(afterGain.gainDb).toBe(2);

    const afterMute = applyStudioClipGainMuteCasToState(
      { documentVersion: 2, gainDb: 2, muted: true },
      2,
      { muted: false },
    );
    expect(afterMute.gainDb).toBe(2);
    expect(afterMute.muted).toBe(false);
  });
});

describe("PR-01/02 playback contract (engine reuse)", () => {
  it("clipGraphGain applies gainDb; muted → 0", () => {
    expect(clipGraphGain({ gainDb: -6, muted: false })).toBeCloseTo(
      Math.pow(10, -6 / 20),
      5,
    );
    expect(clipGraphGain({ gainDb: 0, muted: true })).toBe(0);
    expect(clipGraphGain({ gainDb: 6, muted: true })).toBe(0);
  });

  it("effectiveGain = baseClipGain × fadeEnvelope; mute zeros base", () => {
    const audible = {
      gainDb: -6,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      durationMs: 5000,
      timelineStartMs: 0,
    };
    expect(baseClipGain(audible)).toBe(clipGraphGain(audible));
    expect(effectiveClipGain(audible, 1000)).toBe(baseClipGain(audible));

    const muted = { ...audible, muted: true };
    expect(baseClipGain(muted)).toBe(0);
    expect(effectiveClipGain(muted, 1000)).toBe(0);
  });
});

describe("PR-01/02 AuthZ / API contract (source)", () => {
  it("maps unauth / non-owner / conflict statuses", () => {
    expect(
      studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status,
    ).toBe(401);
    expect(studioApiErrorResponse(new AuthError("FORBIDDEN", "x")).status).toBe(
      403,
    );
    expect(studioApiErrorResponse(new AuthError("NOT_FOUND", "x")).status).toBe(
      404,
    );
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
  });

  it("Clip PATCH wires set_gain + set_mute + documentVersion", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/op === "set_gain"/);
    expect(routeSrc).toMatch(/op === "set_mute"/);
    expect(routeSrc).toMatch(/updateStudioClipGain/);
    expect(routeSrc).toMatch(/updateStudioClipMute/);
    expect(routeSrc).toMatch(/documentVersion:\s*result\.documentVersion/);
    expect(routeSrc).toMatch(/op === "set_fades"/);
    expect(routeSrc).not.toMatch(/VocalEditorEngine/);
    expect(routeSrc).not.toMatch(/FadeEngine/);
    expect(routeSrc).not.toMatch(/PlayerProvider/);
  });

  it("service uses atomic RPC CAS + ownership + existing columns", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/updateStudioClipGainMuteFor/);
    expect(service).toMatch(/updateStudioClipGainFor/);
    expect(service).toMatch(/updateStudioClipMuteFor/);
    expect(service).toMatch(/studio_cas_apply_clip_gain_mute/);
    expect(service).toMatch(/loadOwnedClip/);
    expect(service).toMatch(/parseExpectedDocumentVersion/);
    expect(service).toMatch(/parseStudioClipGainDb/);
    expect(service).toMatch(/parseStudioClipMuted/);
    expect(service).toMatch(/StudioFxCasConflictError/);
    expect(service).toMatch(/p_gain_db/);
    expect(service).toMatch(/p_muted/);
    expect(service).not.toMatch(/VocalEditorEngine/);
    expect(service).not.toMatch(/CREATE TABLE/);
  });

  it("CAS SQL is service_role only; revokes anon/authenticated; no new tables", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_gain_mute/,
    );
    expect(sql).toMatch(/gain_db = p_gain_db/);
    expect(sql).toMatch(/muted = p_muted/);
    expect(sql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(sql).toMatch(/AND studio_projects\.document_version = p_expected/);
    expect(sql).toMatch(/CLIP_NOT_FOUND/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/ALTER TABLE/);
  });

  it("UI builds set_gain / set_mute bodies with expectedDocumentVersion", () => {
    expect(
      buildStudioClipGainPatchBody({
        gainDb: -3,
        expectedDocumentVersion: 4,
      }),
    ).toEqual({
      op: "set_gain",
      gainDb: -3,
      expectedDocumentVersion: 4,
    });
    expect(
      buildStudioClipMutePatchBody({
        muted: true,
        expectedDocumentVersion: 4,
      }),
    ).toEqual({
      op: "set_mute",
      muted: true,
      expectedDocumentVersion: 4,
    });
  });

  it("interpret persist response maps conflict / auth / success", () => {
    expect(
      interpretStudioClipMixPersistResponse(409, {
        code: "FX_CHAIN_VERSION_CONFLICT",
        error: "Konflikt",
      }).kind,
    ).toBe("conflict");
    expect(
      interpretStudioClipMixPersistResponse(401, { error: "x" }).kind,
    ).toBe("unauthorized");
    expect(
      interpretStudioClipMixPersistResponse(403, { error: "x" }).kind,
    ).toBe("forbidden");
    const ok = interpretStudioClipMixPersistResponse(200, {
      success: true,
      documentVersion: 9,
      clip: {
        id: "c1",
        trackId: "t1",
        sourceKind: "take",
        sourceTakeId: "take-1",
        sourceBeatId: null,
        sourceArtifactId: null,
        timelineStartMs: 0,
        durationMs: 1000,
        sourceOffsetMs: 0,
        gainDb: -3,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.documentVersion).toBe(9);
      expect(ok.clip.gainDb).toBe(-3);
    }
  });

  it("ClipEditPanel exposes Gain + Mute controls (no second engine)", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/function ClipEditPanel/);
    expect(editor).toMatch(/Zapisz głośność/);
    expect(editor).toMatch(/Wycisz klip/);
    expect(editor).toMatch(/onSaveGain/);
    expect(editor).toMatch(/onSaveMute/);
    expect(editor).toMatch(/saveClipGain/);
    expect(editor).toMatch(/saveClipMute/);
    expect(editor).toMatch(/buildStudioClipGainPatchBody/);
    expect(editor).toMatch(/buildStudioClipMutePatchBody/);
    expect(editor).toMatch(/STUDIO_CLIP_GAIN_DB_MIN/);
    expect(editor).toMatch(/min-h-11/);
    expect(editor).not.toMatch(/VocalEditorEngine/);
    expect(editor).not.toMatch(/PostProductionEngine/);
    expect(editor).not.toMatch(/ClipPan/);
    expect(editor).not.toMatch(/Region Mute/);
  });

  it("does not invent second audio path / engines", () => {
    const files = [
      "src/lib/studio/studio-clip-mix.ts",
      "src/lib/studio/studio-service.ts",
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      "src/components/studio/studio-editor.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/VocalEditorEngine/);
      expect(src).not.toMatch(/PostProductionEngine/);
      expect(src).not.toMatch(/FadeEngine/);
      expect(src).not.toMatch(/StudioMixEngine/);
      expect(src).not.toMatch(/new AudioContext/);
      expect(src).not.toMatch(/PlayerProvider/);
    }
  });
});
