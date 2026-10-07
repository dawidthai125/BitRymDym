/**
 * P6.7.2 — Clip Fade Write Path / CAS contract.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  applyStudioClipFadesCasToState,
  normalizeFades,
  parseStudioFadeMs,
  resolveStudioClipFadesForWrite,
} from "@/lib/studio/studio-clip-fade";
import {
  parseExpectedDocumentVersion,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

const D = 10_000;

describe("P6.7.2 validation (§9.1)", () => {
  it("accepts fadeIn = 0 and fadeOut = 0", () => {
    expect(resolveStudioClipFadesForWrite(0, 0, D)).toEqual({
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  });

  it("accepts fadeIn + fadeOut < duration", () => {
    expect(resolveStudioClipFadesForWrite(1000, 2000, D)).toEqual({
      fadeInMs: 1000,
      fadeOutMs: 2000,
    });
  });

  it("accepts fadeIn + fadeOut = duration", () => {
    expect(resolveStudioClipFadesForWrite(4000, 6000, D)).toEqual({
      fadeInMs: 4000,
      fadeOutMs: 6000,
    });
  });

  it("proportionally normalizes when fadeIn + fadeOut > duration", () => {
    // Each side <= D (passes §9.1); sum > D → §9.2 proportional normalize.
    const n = resolveStudioClipFadesForWrite(1500, 1000, 2000);
    expect(n).toEqual(normalizeFades(1500, 1000, 2000));
    expect(n.fadeInMs + n.fadeOutMs).toBe(2000);
    expect(n.fadeInMs).toBe(1200);
    expect(n.fadeOutMs).toBe(800);
  });

  it("rejects negative fadeIn → 400 vocabulary", () => {
    expect(() => parseStudioFadeMs(-1, "fadeInMs", D)).toThrow(StudioFxChainError);
    const res = studioApiErrorResponse(
      (() => {
        try {
          parseStudioFadeMs(-1, "fadeInMs", D);
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects negative fadeOut → 400", () => {
    expect(() => parseStudioFadeMs(-5, "fadeOutMs", D)).toThrow(
      StudioFxChainError,
    );
  });

  it("rejects non-integer fades → 400", () => {
    expect(() => parseStudioFadeMs(1.5, "fadeInMs", D)).toThrow(
      StudioFxChainError,
    );
    expect(() => parseStudioFadeMs(2.2, "fadeOutMs", D)).toThrow(
      StudioFxChainError,
    );
    expect(() => parseStudioFadeMs("100", "fadeInMs", D)).toThrow(
      StudioFxChainError,
    );
    expect(() => parseStudioFadeMs(NaN, "fadeOutMs", D)).toThrow(
      StudioFxChainError,
    );
  });

  it("rejects fadeIn > duration → 400", () => {
    expect(() => parseStudioFadeMs(D + 1, "fadeInMs", D)).toThrow(
      StudioFxChainError,
    );
  });

  it("rejects fadeOut > duration → 400", () => {
    expect(() => parseStudioFadeMs(D + 1, "fadeOutMs", D)).toThrow(
      StudioFxChainError,
    );
  });

  it("rejects missing/invalid expectedDocumentVersion → 400", () => {
    expect(() => parseExpectedDocumentVersion(undefined)).toThrow(
      StudioFxChainError,
    );
    expect(() => parseExpectedDocumentVersion(1.5)).toThrow(StudioFxChainError);
    expect(() => parseExpectedDocumentVersion("7")).toThrow(StudioFxChainError);
    expect(() => parseExpectedDocumentVersion(0)).toThrow(StudioFxChainError);
    expect(studioApiErrorResponse(new StudioFxChainError("FX_CHAIN_INVALID", "x")).status).toBe(
      400,
    );
  });
});

describe("P6.7.2 CAS (in-memory)", () => {
  it("owner + correct version → success, fades saved, documentVersion +1", () => {
    const before = { documentVersion: 7, fadeInMs: 0, fadeOutMs: 0 };
    const after = applyStudioClipFadesCasToState(before, 7, {
      fadeInMs: 500,
      fadeOutMs: 800,
      durationMs: D,
    });
    expect(after.fadeInMs).toBe(500);
    expect(after.fadeOutMs).toBe(800);
    expect(after.documentVersion).toBe(8);
  });

  it("persists correct normalized values", () => {
    const after = applyStudioClipFadesCasToState(
      { documentVersion: 1, fadeInMs: 0, fadeOutMs: 0 },
      1,
      { fadeInMs: 1500, fadeOutMs: 1000, durationMs: 2000 },
    );
    expect(after.fadeInMs).toBe(1200);
    expect(after.fadeOutMs).toBe(800);
    expect(after.documentVersion).toBe(2);
  });

  it("stale expectedDocumentVersion → 409 and leaves fades + version unchanged", () => {
    const state = { documentVersion: 7, fadeInMs: 100, fadeOutMs: 200 };
    expect(() =>
      applyStudioClipFadesCasToState(state, 6, {
        fadeInMs: 999,
        fadeOutMs: 888,
        durationMs: D,
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(7);
    expect(state.fadeInMs).toBe(100);
    expect(state.fadeOutMs).toBe(200);
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
  });

  it("successful retry with fresh version → success", () => {
    let state = { documentVersion: 7, fadeInMs: 0, fadeOutMs: 0 };
    expect(() =>
      applyStudioClipFadesCasToState(state, 6, {
        fadeInMs: 100,
        fadeOutMs: 100,
        durationMs: D,
      }),
    ).toThrow(StudioFxCasConflictError);

    state = applyStudioClipFadesCasToState(state, 7, {
      fadeInMs: 100,
      fadeOutMs: 100,
      durationMs: D,
    });
    expect(state.documentVersion).toBe(8);
    expect(state.fadeInMs).toBe(100);
    expect(state.fadeOutMs).toBe(100);
  });

  it("no partial mutation on any CAS failure", () => {
    const state = { documentVersion: 3, fadeInMs: 50, fadeOutMs: 75 };
    const snapshot = { ...state };
    expect(() =>
      applyStudioClipFadesCasToState(state, 2, {
        fadeInMs: 1,
        fadeOutMs: 1,
        durationMs: D,
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state).toEqual(snapshot);
  });

  it("second writer with stale expected fails without overwrite", () => {
    let state = { documentVersion: 7, fadeInMs: 0, fadeOutMs: 0 };
    state = applyStudioClipFadesCasToState(state, 7, {
      fadeInMs: 400,
      fadeOutMs: 200,
      durationMs: D,
    });
    expect(() =>
      applyStudioClipFadesCasToState(state, 7, {
        fadeInMs: 0,
        fadeOutMs: 0,
        durationMs: D,
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(8);
    expect(state.fadeInMs).toBe(400);
    expect(state.fadeOutMs).toBe(200);
  });
});

describe("P6.7.2 AuthZ / API contract (source + error mapping)", () => {
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

  it("Clip PATCH route wires set_fades + documentVersion response", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/op === "set_fades"/);
    expect(routeSrc).toMatch(/updateStudioClipFades/);
    expect(routeSrc).toMatch(/expectedDocumentVersion/);
    expect(routeSrc).toMatch(/fadeInMs/);
    expect(routeSrc).toMatch(/fadeOutMs/);
    expect(routeSrc).toMatch(/documentVersion:\s*result\.documentVersion/);
    expect(routeSrc).toMatch(/updateStudioClipGeometry/);
    expect(routeSrc).toMatch(/Nieznana lub brakująca operacja/);
    expect(routeSrc).not.toMatch(/\/fade/);
    expect(routeSrc).not.toMatch(/FadeEngine/);
    expect(routeSrc).not.toMatch(/mix-graph/);
    expect(routeSrc).not.toMatch(/PlayerProvider/);
  });

  it("unknown op preserves existing 400 behavior", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(
      /error: "Nieznana lub brakująca operacja \(op\)\."/,
    );
    expect(routeSrc).toMatch(/status: 400/);
  });

  it("service uses atomic RPC CAS + existing fade columns + ownership", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/updateStudioClipFadesFor/);
    expect(service).toMatch(/studio_cas_apply_clip_fades/);
    expect(service).toMatch(/resolveStudioClipFadesForWrite/);
    expect(service).toMatch(/loadOwnedClip/);
    expect(service).toMatch(/parseExpectedDocumentVersion/);
    expect(service).toMatch(/StudioFxCasConflictError/);
    expect(service).toMatch(/p_fade_in_ms/);
    expect(service).toMatch(/p_fade_out_ms/);
    expect(service).not.toMatch(/CREATE TABLE/);
    expect(service).not.toMatch(/FadeEngine/);
    expect(service).not.toMatch(/mix-graph/);
  });

  it("CAS SQL is service_role only, qualifies document_version, no new tables", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261007120000_p6_7_2_studio_cas_apply_clip_fades.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_fades/,
    );
    expect(sql).toMatch(/fade_in_ms/);
    expect(sql).toMatch(/fade_out_ms/);
    expect(sql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(sql).toMatch(/AND studio_projects\.document_version = p_expected/);
    expect(sql).toMatch(/CLIP_NOT_FOUND/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/ALTER TABLE/);
  });

  it("reuses P6.7.1 normalizeFades (no second normalize implementation)", () => {
    const fadeSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-clip-fade.ts"),
      "utf8",
    );
    const normalizeDefs = fadeSrc.match(/export function normalizeFades/g);
    expect(normalizeDefs).toHaveLength(1);
    expect(fadeSrc).toMatch(/resolveStudioClipFadesForWrite/);
    expect(fadeSrc).toMatch(/return normalizeFades\(fi, fo, D\)/);
    expect(fadeSrc).toMatch(/applyStudioClipFadesCasToState/);
  });

  it("does not invent FadeEngine / AutomationEngine / second AudioContext", () => {
    const files = [
      "src/lib/studio/studio-clip-fade.ts",
      "src/lib/studio/studio-service.ts",
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/FadeEngine/);
      expect(src).not.toMatch(/AutomationEngine/);
      expect(src).not.toMatch(/ClipFadeEngine/);
      expect(src).not.toMatch(/new AudioContext/);
      expect(src).not.toMatch(/mix-graph/);
      expect(src).not.toMatch(/PlayerProvider/);
    }
  });

  it("existing geometry Clip PATCH ops remain wired (not replaced)", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      ),
      "utf8",
    );
    for (const op of [
      "move",
      "trim_left",
      "trim_right",
      "trim_left_to_playhead",
      "trim_right_to_playhead",
      "set_geometry",
    ]) {
      expect(routeSrc).toContain(`case "${op}"`);
    }
    expect(routeSrc).toMatch(/updateStudioClipGeometry/);
  });
});
